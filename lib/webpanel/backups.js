import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import sqlite3 from 'sqlite3'
import { promisify } from 'node:util'
import { PanelStore } from './store.js'
import { sqlAll, sqlRun } from './push.js'
import { ArchivoSqliteCompartido } from '../db-sqlite.js'
import { acquireRestoreLock } from '../restore-lock.js'

const scrypt = promisify(crypto.scrypt)
const MAX = 32 * 1024 * 1024
const TABLES = [
  'panel_roles',
  'panel_users',
  'panel_meta',
  'panel_communities',
  'panel_push_devices',
]
export async function sealBackup(data, password) {
  if (
    typeof password !== 'string' ||
    password.length < 12 ||
    password.length > 200
  )
    throw new Error(
      'La contraseña de la copia debe tener entre 12 y 200 caracteres.'
    )
  const plain = Buffer.from(JSON.stringify(data))
  if (plain.length > MAX)
    throw new Error(
      'La copia supera 32 MB de datos. Usa una copia SQLite fuera del panel para bases mayores.'
    )
  const salt = crypto.randomBytes(16),
    iv = crypto.randomBytes(12)
  const key = await scrypt(password, salt, 32, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  })
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from('pain-backup-v1'))
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()])
  key.fill(0)
  return {
    format: 'pain-backup',
    version: 1,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64'),
  }
}
export async function openBackup(archive, password) {
  if (
    !archive ||
    archive.format !== 'pain-backup' ||
    archive.version !== 1 ||
    typeof archive.data !== 'string' ||
    archive.data.length > Math.ceil((MAX * 4) / 3) + 8
  )
    throw new Error(
      'El archivo no es una copia compatible o supera el tamaño permitido.'
    )
  if (
    typeof password !== 'string' ||
    password.length < 12 ||
    password.length > 200
  )
    throw new Error('La contraseña no es válida.')
  const salt = Buffer.from(String(archive.salt || ''), 'base64'),
    iv = Buffer.from(String(archive.iv || ''), 'base64'),
    tag = Buffer.from(String(archive.tag || ''), 'base64')
  if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16)
    throw new Error('La copia está dañada.')
  const key = await scrypt(password, salt, 32, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  })
  let data
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAAD(Buffer.from('pain-backup-v1'))
    decipher.setAuthTag(tag)
    data = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(archive.data, 'base64')),
        decipher.final(),
      ]).toString('utf8')
    )
  } catch {
    throw new Error(
      'Contraseña incorrecta o copia dañada. No se modificó ningún dato.'
    )
  } finally {
    key.fill(0)
  }
  validateBackup(data)
  return data
}
export function validateBackup(data) {
  if (
    !data ||
    data.format !== 'pain-data' ||
    data.version !== 1 ||
    (!data.panel && !data.global)
  )
    throw new Error('La copia no contiene datos compatibles.')
  const stack = [[data, 0]]
  while (stack.length) {
    const [value, depth] = stack.pop()
    if (depth > 64)
      throw new Error('La copia tiene una estructura demasiado profunda.')
    if (value && typeof value === 'object')
      for (const [key, item] of Object.entries(value)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key))
          throw new Error('La copia contiene claves no permitidas.')
        stack.push([item, depth + 1])
      }
    else if (typeof value === 'number' && !Number.isFinite(value))
      throw new Error('La copia contiene números no válidos.')
  }
  if (data.global) {
    if (typeof data.global !== 'object' || Array.isArray(data.global))
      throw new Error('La base global no es válida.')
    for (const key of ['users', 'chats'])
      if (
        data.global[key] &&
        (typeof data.global[key] !== 'object' ||
          Array.isArray(data.global[key]))
      )
        throw new Error(`La colección ${key} no es válida.`)
  }
  if (data.panel) {
    for (const table of TABLES)
      if (!Array.isArray(data.panel[table])) throw new Error(`Falta ${table}.`)
    const roles = new Map(),
      users = new Set(),
      names = new Set(),
      emails = new Set()
    for (const role of data.panel.panel_roles) {
      if (
        !Number.isSafeInteger(role.id) ||
        role.id < 1 ||
        roles.has(role.id) ||
        !['admin', 'user'].includes(role.scope) ||
        typeof role.name !== 'string' ||
        typeof role.key !== 'string'
      )
        throw new Error('Los roles de la copia no son válidos.')
      const permissions = JSON.parse(role.permissions)
      if (
        !Array.isArray(permissions) ||
        permissions.some((key) => typeof key !== 'string') ||
        (permissions.includes('*') && role.key !== 'principal')
      )
        throw new Error('Hay permisos de rol no válidos.')
      roles.set(role.id, role)
    }
    for (const key of ['principal', 'admin', 'user'])
      if ([...roles.values()].filter((role) => role.key === key).length !== 1)
        throw new Error('Faltan roles del sistema o están duplicados.')
    let principals = 0
    for (const user of data.panel.panel_users) {
      const name = String(user.username || '').toLowerCase(),
        email = String(user.email || '').toLowerCase()
      if (
        !Number.isSafeInteger(user.id) ||
        user.id < 1 ||
        users.has(user.id) ||
        names.has(name) ||
        !name ||
        !roles.has(user.role_id) ||
        !['active', 'banned'].includes(user.status) ||
        !/^scrypt\$[\w-]{22}\$[\w-]{86}$/.test(user.password_hash || '') ||
        (email && emails.has(email))
      )
        throw new Error(
          'Hay usuarios, contraseñas o correos no válidos en la copia.'
        )
      const principal = Number(user.is_principal) === 1
      if (principal) {
        principals++
        if (
          user.status !== 'active' ||
          roles.get(user.role_id).key !== 'principal'
        )
          throw new Error('El principal de la copia no es válido.')
      } else if (roles.get(user.role_id).key === 'principal')
        throw new Error('Un usuario secundario tiene el rol principal.')
      users.add(user.id)
      names.add(name)
      if (email) emails.add(email)
    }
    if (principals !== 1)
      throw new Error(
        'La copia debe contener exactamente un administrador principal activo.'
      )
    for (const item of data.panel.panel_push_devices)
      if (
        !users.has(item.user_id) ||
        !/^[\w-]{16,80}$/.test(item.device_id || '')
      )
        throw new Error(
          'Hay preferencias de notificaciones sin usuario válido.'
        )
    for (const item of data.panel.panel_communities)
      if (item.created_by !== null && !users.has(item.created_by))
        throw new Error('Hay comunidades sin creador válido.')
    const keys = new Set()
    for (const item of data.panel.panel_meta) {
      if (
        typeof item.key !== 'string' ||
        keys.has(item.key) ||
        (typeof item.value !== 'string' && item.value !== null)
      )
        throw new Error('Hay ajustes duplicados o no válidos.')
      keys.add(item.key)
    }
  }
  return data
}
export async function collectBackup(store, config, scope = 'all') {
  if (!['all', 'panel', 'global'].includes(scope))
    throw new Error('Selecciona qué datos quieres exportar.')
  const result = {
    format: 'pain-data',
    version: 1,
    createdAt: Date.now(),
    panel: null,
    global: null,
  }
  if (scope !== 'global') {
    const db = await new Promise((resolve, reject) => {
      const conn = new sqlite3.Database(
        store.filename,
        sqlite3.OPEN_READONLY,
        (error) => (error ? reject(error) : resolve(conn))
      )
    })
    const snapshot = { db }
    await sqlRun(snapshot, 'BEGIN')
    try {
      result.panel = {}
      result.panel.panel_roles = await sqlAll(
        snapshot,
        'SELECT * FROM panel_roles'
      )
      result.panel.panel_users = await sqlAll(
        snapshot,
        'SELECT id,username,email,password_hash,role,role_id,is_principal,email_verified_at,status,created_at,last_login_at FROM panel_users'
      )
      result.panel.panel_meta = await sqlAll(
        snapshot,
        'SELECT * FROM panel_meta'
      )
      result.panel.panel_communities = await sqlAll(
        snapshot,
        'SELECT * FROM panel_communities'
      )
      result.panel.panel_push_devices = await sqlAll(
        snapshot,
        'SELECT user_id,device_id,permission,checked_at FROM panel_push_devices'
      )
      await sqlRun(snapshot, 'COMMIT')
    } catch (error) {
      await sqlRun(snapshot, 'ROLLBACK').catch(() => {})
      throw error
    } finally {
      await new Promise((resolve, reject) =>
        db.close((error) => (error ? reject(error) : resolve()))
      )
    }
  }
  if (scope !== 'panel') {
    if (!fs.existsSync(config.globalDbFile))
      throw new Error('La base global todavía no existe en este servidor.')
    const adapter = new ArchivoSqliteCompartido(
      config.globalDbFile,
      `${config.globalDbFile}.no-legacy`
    )
    try {
      result.global = await adapter.read()
    } finally {
      await adapter.close()
    }
  }
  validateBackup(result)
  return result
}
export async function stageBackup(config, data) {
  validateBackup(data)
  const id = crypto.randomUUID(),
    directory = path.join(config.dataDir, 'restore-pending')
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 })
  let pending=0
  for(const entry of await fs.promises.readdir(directory,{withFileTypes:true})){
    if(!entry.isFile()||!/^[a-f0-9-]{36}\.painbackup$/.test(entry.name))continue
    const filename=path.join(directory,entry.name),stat=await fs.promises.stat(filename)
    if(Date.now()-stat.mtimeMs>7*86400000)await fs.promises.unlink(filename)
    else pending++
  }
  if(pending>=5)throw new Error('Ya hay cinco importaciones preparadas. Aplica una o elimina una preparación antigua antes de subir otra.')
  const secret = crypto
    .createHash('sha256')
    .update(config.sessionSecret)
    .digest('hex')
  const archive = await sealBackup(data, secret)
  await fs.promises.writeFile(
    path.join(directory, `${id}.painbackup`),
    JSON.stringify(archive),
    { mode: 0o600, flag: 'wx' }
  )
  return {
    id,
    users: data.panel?.panel_users.length || 0,
    global: Boolean(data.global),
    command: `node scripts/panel-backup.js restore --id ${id}`,
  }
}

async function preparePanel(filename, data) {
  await fs.promises.mkdir(path.dirname(filename), { recursive: true })
  await fs.promises.writeFile(filename, '', { mode: 0o600, flag: 'wx' })
  const store = new PanelStore(filename)
  try {
    await store.init()
    await sqlRun(store, 'BEGIN IMMEDIATE')
    try {
      for (const table of [
        'panel_users',
        'panel_roles',
        'panel_meta',
        'panel_communities',
      ])
        await sqlRun(store, `DELETE FROM ${table}`)
      const columns = {
        panel_roles: [
          'id',
          'key',
          'name',
          'description',
          'scope',
          'permissions',
          'system',
          'created_at',
          'updated_at',
        ],
        panel_users: [
          'id',
          'username',
          'email',
          'password_hash',
          'role',
          'role_id',
          'is_principal',
          'email_verified_at',
          'status',
          'created_at',
          'last_login_at',
        ],
        panel_meta: ['key', 'value'],
        panel_communities: [
          'id',
          'name',
          'link',
          'description',
          'created_by',
          'active',
          'created_at',
        ],
        panel_push_devices: [
          'user_id',
          'device_id',
          'permission',
          'checked_at',
        ],
      }
      for (const table of TABLES)
        for (const row of data[table])
          await sqlRun(
            store,
            `INSERT INTO ${table} (${columns[table].join(',')}) VALUES (${columns[table].map(() => '?').join(',')})`,
            columns[table].map((key) => row[key] ?? null)
          )
      const violations = await sqlAll(store, 'PRAGMA foreign_key_check')
      if (violations.length)
        throw new Error('La copia contiene referencias a usuarios no válidas.')
      await sqlRun(store, 'COMMIT')
    } catch (error) {
      await sqlRun(store, 'ROLLBACK').catch(() => {})
      throw error
    }
    await sqlAll(store, 'PRAGMA wal_checkpoint(TRUNCATE)')
  } finally {
    await store.close()
  }
}

/** Solo offline: prepara candidatos completos, guarda recuperación y reemplaza. */
async function writeJournal(filename,data){
  const temporary=filename+'.tmp'
  const file=await fs.promises.open(temporary,'w',0o600)
  try{await file.writeFile(JSON.stringify(data,null,2));await file.sync()}finally{await file.close()}
  await fs.promises.rename(temporary,filename)
}
async function rollbackSwaps(swaps,id){
  for(const item of [...swaps].reverse()){
    const oldBase=item.saved.find((saved)=>saved.original===item.target)
    if(!fs.existsSync(item.candidate)&&fs.existsSync(item.target)&&(!oldBase||fs.existsSync(oldBase.saved))){
      if(await fileHash(item.target)!==item.newHash)throw new Error('El archivo actual no coincide con el candidato. Se necesita revisión manual.')
      await fs.promises.rename(item.target,`${item.target}.failed-${id}-${crypto.randomUUID()}`)
    }
    for(const saved of [...item.saved].reverse())if(fs.existsSync(saved.saved))await fs.promises.rename(saved.saved,saved.original)
  }
}
async function fileHash(filename){
  const hash=crypto.createHash('sha256')
  for await(const chunk of fs.createReadStream(filename))hash.update(chunk)
  return hash.digest('hex')
}
export async function restoreBackup(config, data) {
  validateBackup(data)
  const release = acquireRestoreLock(config.runtimeLockDir)
  const id = crypto.randomUUID(),
    recovery = path.join(config.dataDir, 'restore-recovery', id)
  const swaps = []
  const journal=path.join(config.runtimeLockDir,'restore.lock','journal.json')
  const manifest=path.join(recovery,'manifest.json')
  let journaled=false
  try {
    await fs.promises.mkdir(recovery, { recursive: true, mode: 0o700 })
    const candidates = []
    if (data.panel) {
      const target = config.dbFile,
        candidate = `${target}.restore-${id}`
      await preparePanel(candidate, data.panel)
      candidates.push({ target, candidate })
    }
    if (data.global) {
      const target = config.globalDbFile,
        candidate = `${target}.restore-${id}`
      await fs.promises.mkdir(path.dirname(candidate), { recursive: true })
      await fs.promises.writeFile(candidate, '', { mode: 0o600, flag: 'wx' })
      const adapter = new ArchivoSqliteCompartido(
        candidate,
        `${candidate}.no-legacy`
      )
      try {
        await adapter.write(data.global)
        await adapter.checkpointWal(candidate)
      } finally {
        await adapter.close()
      }
      candidates.push({ target, candidate })
    }
    // El plan completo se persiste ANTES del primer cambio de nombre.
    for (const [index, item] of candidates.entries()) {
      const entry = { ...item, saved: [], newHash:await fileHash(item.candidate) }
      swaps.push(entry)
      for (const suffix of [
        '',
        '-wal',
        '-shm',
        ...(item.target === config.globalDbFile
          ? ['.claims.sqlite', '.claims.sqlite-wal', '.claims.sqlite-shm']
          : []),
      ]) {
        const original = item.target + suffix
        if (fs.existsSync(original)) {
          const saved = path.join(recovery, `${index}${suffix || '.sqlite'}`)
          entry.saved.push({ original, saved })
        }
      }
    }
    await writeJournal(manifest,{id,status:'pending',createdAt:Date.now(),swaps})
    await writeJournal(journal,{id})
    journaled=true
    for(const item of swaps){
      for(const saved of item.saved)await fs.promises.rename(saved.original,saved.saved)
      await fs.promises.rename(item.candidate,item.target)
    }
    await writeJournal(manifest,{id,status:'complete',createdAt:Date.now(),swaps})
    await fs.promises.unlink(journal)
    return {
      recovery,
      users: data.panel?.panel_users.length || 0,
      global: Boolean(data.global),
    }
  } catch (error) {
    if(journaled){
      try{
        await rollbackSwaps(swaps,id)
        await writeJournal(manifest,{id,status:'rolled-back',createdAt:Date.now(),swaps})
        await fs.promises.unlink(journal)
      }catch(rollbackError){throw new Error(`Restauración interrumpida. No inicies el bot. Ejecuta: node scripts/panel-backup.js recover --id ${id}. ${rollbackError.message}`)}
    }
    throw new Error(
      `No se pudo restaurar. Revisa la recuperación en ${recovery}. ${error.message}`
    )
  } finally {
    release()
  }
}

export async function recoverBackup(config,id){
  if(!/^[a-f0-9-]{36}$/.test(String(id)))throw new Error('Identificador no válido.')
  const release=acquireRestoreLock(config.runtimeLockDir,{recovery:true})
  try{
    const journal=path.join(config.runtimeLockDir,'restore.lock','journal.json')
    if(JSON.parse(await fs.promises.readFile(journal,'utf8')).id!==id)throw new Error('Ese identificador no coincide con la restauración pendiente.')
    const recovery=path.join(config.dataDir,'restore-recovery',id),manifest=path.join(recovery,'manifest.json')
    const plan=JSON.parse(await fs.promises.readFile(manifest,'utf8'))
    if(!['pending','complete','rolled-back'].includes(plan.status)||!Array.isArray(plan.swaps))throw new Error('El registro de recuperación no es válido.')
    for(const item of plan.swaps){
      if(![config.dbFile,config.globalDbFile].includes(item.target)||item.candidate!==`${item.target}.restore-${id}`)throw new Error('Rutas de recuperación no válidas.')
      for(const saved of item.saved){
        if(!path.resolve(saved.saved).startsWith(path.resolve(recovery)+path.sep)||!['','-wal','-shm','.claims.sqlite','.claims.sqlite-wal','.claims.sqlite-shm'].some((suffix)=>saved.original===item.target+suffix))throw new Error('Archivo de recuperación no válido.')
      }
    }
    if(plan.status==='pending'){await rollbackSwaps(plan.swaps,id);await writeJournal(manifest,{...plan,status:'rolled-back'})}
    await fs.promises.unlink(journal)
    return {recovery,status:plan.status==='complete'?'complete':'rolled-back'}
  }finally{release()}
}

export async function readStagedBackup(config, id) {
  if (!/^[a-f0-9-]{36}$/.test(String(id)))
    throw new Error('El identificador no es válido.')
  const file = path.join(config.dataDir, 'restore-pending', `${id}.painbackup`)
  const stat = await fs.promises.stat(file)
  if (stat.size > 48 * 1024 * 1024) throw new Error('Copia demasiado grande.')
  const secret = crypto
    .createHash('sha256')
    .update(config.sessionSecret)
    .digest('hex')
  return openBackup(
    JSON.parse(await fs.promises.readFile(file, 'utf8')),
    secret
  )
}
