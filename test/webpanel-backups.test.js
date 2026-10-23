import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import crypto from 'node:crypto'
import { PanelStore } from '../lib/webpanel/store.js'
import { ArchivoSqliteCompartido } from '../lib/db-sqlite.js'
import { hashPassword, verifyPassword } from '../lib/webpanel/auth.js'
import {
  collectBackup,
  sealBackup,
  openBackup,
  stageBackup,
  readStagedBackup,
  restoreBackup,
  recoverBackup,
} from '../lib/webpanel/backups.js'
import { acquireRuntimeLease } from '../lib/runtime-lease.js'
import { sqlAll } from '../lib/webpanel/push.js'
import { startWebPanel } from '../lib/webpanel/server.js'

test('copias: cifrado, contraseñas portables, base global completa y restauración offline', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-backups-'))
  const source = {
    dataDir: path.join(dir, 'source'),
    dbFile: path.join(dir, 'source', 'panel.sqlite'),
    globalDbFile: path.join(dir, 'source', 'global.sqlite'),
    sessionSecret: 'a'.repeat(48),
    runtimeLockDir: path.join(dir, 'source', 'runtime'),
  }
  const target = {
    dataDir: path.join(dir, 'target'),
    dbFile: path.join(dir, 'target', 'panel.sqlite'),
    globalDbFile: path.join(dir, 'target', 'global.sqlite'),
    sessionSecret: 'b'.repeat(48),
    runtimeLockDir: path.join(dir, 'target', 'runtime'),
  }
  let store = await new PanelStore(source.dbFile).init(),
    restored,
    lease
  try {
    const hash = await hashPassword('same-password-on-new-server')
    const owner = await store.crearUsuario({
      username: 'owner',
      email: 'owner@example.com',
      passwordHash: hash,
      role: 'admin',
    })
    await store.establecerPrincipal(owner.id)
    const user = await store.crearUsuario({
      username: 'maria',
      email: 'maria@example.com',
      passwordHash: hash,
    })
    await store.establecerMeta('mail_pass', 'fake-private-smtp-password')
    await store.upsertBot({
      userId: user.id,
      phone: '5215512345678',
      folder: '5215512345678',
    })
    await store.crearSesionWeb({
      tokenHash: 'old-cookie-hash',
      userId: user.id,
      csrfToken: 'old-csrf',
      expiresAt: Date.now() + 60000,
    })
    const globalData = {
      users: {
        '123@s.whatsapp.net': {
          coins: 12345,
          married: '456@s.whatsapp.net',
          inventory: ['a', 'b'],
        },
        '456@s.whatsapp.net': { coins: 10, married: '123@s.whatsapp.net' },
      },
      chats: { 'group@g.us': { welcome: true } },
      settings: { currency: 'coins' },
      customCollection: { test: [1, 2, 3] },
    }
    const adapter = new ArchivoSqliteCompartido(
      source.globalDbFile,
      source.globalDbFile + '.no-legacy'
    )
    await adapter.write(globalData)
    await adapter.close()
    const data = await collectBackup(store, source, 'all')
    assert.equal(data.panel.panel_users.length, 2)
    assert.ok(!('panel_bots' in data.panel))
    assert.ok(!('panel_web_sessions' in data.panel))
    assert.ok(!('panel_email_tokens' in data.panel))
    const archive = await sealBackup(data, 'backup-password-1234')
    assert.ok(!JSON.stringify(archive).includes('fake-private-smtp-password'))
    await assert.rejects(openBackup(archive, 'wrong-password-1234'))
    const damaged = {
      ...archive,
      data: (archive.data[0] === 'A' ? 'B' : 'A') + archive.data.slice(1),
    }
    await assert.rejects(openBackup(damaged, 'backup-password-1234'))
    const decoded = await openBackup(archive, 'backup-password-1234')
    assert.deepEqual(decoded.global, globalData)
    const stage = await stageBackup(target, decoded)
    const staged = await readStagedBackup(target, stage.id)
    const previous=await new PanelStore(target.dbFile).init()
    await previous.crearUsuario({username:'previous',passwordHash:hash})
    await previous.close()
    const oldGlobal=new ArchivoSqliteCompartido(target.globalDbFile,target.globalDbFile+'.no-legacy')
    await oldGlobal.write({users:{old:{coins:999}},chats:{}});await oldGlobal.close()
    lease = acquireRuntimeLease(target.runtimeLockDir, 'primary')
    await assert.rejects(restoreBackup(target, staged), /Detén primero/)
    lease()
    lease = null
    const result = await restoreBackup(target, staged)
    assert.equal(result.users, 2)
    assert.ok(fs.existsSync(result.recovery))
    assert.ok(fs.existsSync(path.join(result.recovery,'0.sqlite')))
    restored = await new PanelStore(target.dbFile).init()
    const migrated = await restored.buscarUsuarioPorNombre('maria')
    assert.equal(migrated.id, user.id)
    assert.equal(
      await verifyPassword(
        'same-password-on-new-server',
        migrated.password_hash
      ),
      true
    )
    assert.equal(await restored.obtenerSesionWeb('old-cookie-hash'), null)
    assert.equal((await restored.listarBots()).length, 0)
    assert.equal(
      await restored.obtenerMeta('mail_pass'),
      'fake-private-smtp-password'
    )
    const restoredGlobal = new ArchivoSqliteCompartido(
      target.globalDbFile,
      target.globalDbFile + '.no-legacy'
    )
    assert.deepEqual(await restoredGlobal.read(), globalData)
    await restoredGlobal.close()
    assert.equal((await sqlAll(restored, 'PRAGMA foreign_key_check')).length, 0)
    await assert.rejects(readStagedBackup(target, '../../secrets'))
    await restored.close();restored=null
    const handle=await startWebPanel({...target,root:path.join(dir,'new-Serbot'),host:'127.0.0.1',port:0,publicUrl:'http://127.0.0.1',adminUser:'owner',adminPass:'different-env-password'})
    try{
      const response=await fetch(`http://127.0.0.1:${handle.server.address().port}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'maria',password:'same-password-on-new-server'})})
      assert.equal(response.status,200,'la misma contraseña debe funcionar tras cambiar de servidor y secreto web')
    }finally{await handle.close()}
  } finally {
    lease?.()
    await store.close()
    await restored?.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('copias: una restauración interrumpida bloquea el arranque y puede revertirse',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pain-restore-crash-'))
  try{
    const id=crypto.randomUUID(),lock=path.join(dir,'runtime','restore.lock'),recovery=path.join(dir,'restore-recovery',id)
    const target=path.join(dir,'panel.sqlite'),candidate=`${target}.restore-${id}`,saved=path.join(recovery,'0.sqlite')
    fs.mkdirSync(lock,{recursive:true});fs.mkdirSync(recovery,{recursive:true})
    fs.writeFileSync(target,'new-database');fs.writeFileSync(saved,'old-database')
    fs.writeFileSync(path.join(lock,'owner.json'),JSON.stringify({pid:2147483647,host:os.hostname()}))
    fs.writeFileSync(path.join(lock,'journal.json'),JSON.stringify({id}))
    fs.writeFileSync(path.join(recovery,'manifest.json'),JSON.stringify({id,status:'pending',swaps:[{target,candidate,newHash:crypto.createHash('sha256').update('new-database').digest('hex'),saved:[{original:target,saved}]}]}))
    assert.throws(()=>acquireRuntimeLease(path.join(dir,'runtime'),'primary'),/restauración/)
    const result=await recoverBackup({dataDir:dir,runtimeLockDir:path.join(dir,'runtime'),dbFile:target,globalDbFile:path.join(dir,'global.sqlite')},id)
    assert.equal(result.status,'rolled-back');assert.equal(fs.readFileSync(target,'utf8'),'old-database')
    const release=acquireRuntimeLease(path.join(dir,'runtime'),'primary');release()
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
