import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import sqlite3 from 'sqlite3'
import { PanelStore } from '../lib/webpanel/store.js'

test('webpanel store: migra usuarios antiguos antes de indexar role_id y conserva datos', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-webpanel-legacy-'))
  const filename = path.join(dir, 'panel.sqlite')
  const legacy = await new Promise((resolve, reject) => {
    const db = new sqlite3.Database(filename, (error) => error ? reject(error) : resolve(db))
  })
  try {
    await new Promise((resolve, reject) => legacy.exec(`
      CREATE TABLE panel_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        email TEXT UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL,
        last_login_at INTEGER,
        last_ip TEXT
      );
      INSERT INTO panel_users (username, email, password_hash, role, created_at)
      VALUES ('legacy-admin', 'admin@example.com', 'existing-hash', 'admin', 123),
             ('legacy-user', 'user@example.com', 'user-hash', 'user', 456);
    `, (error) => error ? reject(error) : resolve()))
  } finally {
    await new Promise((resolve, reject) => legacy.close((error) => error ? reject(error) : resolve()))
  }
  try {
    // Reabrir también comprueba que la migración es idempotente.
    for (let i = 0; i < 2; i++) {
      const store = new PanelStore(filename)
      try {
        await store.init()
        const admin = await store.buscarUsuarioPorNombre('legacy-admin')
        const user = await store.buscarUsuarioPorNombre('legacy-user')
        assert.equal(admin.password_hash, 'existing-hash')
        assert.equal(admin.created_at, 123)
        assert.equal(admin.is_principal, 1)
        assert.ok(admin.role_id)
        assert.equal(user.password_hash, 'user-hash')
        assert.equal(user.role, 'user')
        assert.ok(user.role_id)
        assert.equal(await store.contarUsuarios(), 2)
        const indices = await new Promise((resolve, reject) => store.db.all(
          'PRAGMA index_list(panel_users)', (error, rows) => error ? reject(error) : resolve(rows)
        ))
        assert.ok(indices.some((index) => index.name === 'idx_panel_users_role'))
      } finally {
        await store.close()
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

async function conStore(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-webpanel-store-'))
  const store = new PanelStore(path.join(dir, 'panel.sqlite'))
  try {
    await store.init()
    await fn(store)
  } finally {
    await store.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

test('webpanel store: crea todas las tablas del esquema', async () => {
  await conStore(async (store) => {
    const tablas = await new Promise((resolve, reject) => {
      store.db.all("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name", (error, rows) => {
        if (error) reject(error)
        else resolve(rows.map((row) => row.name))
      })
    })
    for (const tabla of [
      'panel_users',
      'panel_web_sessions',
      'panel_bots',
      'panel_pairings',
      'panel_audit',
      'panel_meta',
    ]) {
      assert.ok(tablas.includes(tabla), `falta la tabla ${tabla}`)
    }
  })
})

test('webpanel store: usuarios, login y cascada', async () => {
  await conStore(async (store) => {
    const usuario = await store.crearUsuario({
      username: 'Ana',
      email: 'ana@example.com',
      passwordHash: 'hash-falso',
      ip: '127.0.0.1',
    })
    assert.equal(usuario.username, 'Ana')
    assert.equal(usuario.role, 'user')
    assert.equal(usuario.status, 'active')
    assert.equal(await store.contarUsuarios(), 1)
    assert.equal(await store.contarAdmins(), 0)

    assert.equal((await store.buscarUsuarioPorNombre('ana')).id, usuario.id)
    assert.equal((await store.buscarUsuarioPorEmail('ANA@example.com')).id, usuario.id)

    await assert.rejects(
      store.crearUsuario({ username: 'ana', passwordHash: 'otro' }),
      /UNIQUE/i
    )

    await store.registrarLogin(usuario.id, '10.0.0.5')
    const actualizado = await store.buscarUsuarioPorId(usuario.id)
    assert.ok(actualizado.last_login_at > 0)
    assert.equal(actualizado.last_ip, '10.0.0.5')

    await store.actualizarUsuario(usuario.id, { role: 'admin' })
    assert.equal(await store.contarAdmins(), 1)
    await store.actualizarUsuario(usuario.id, { status: 'banned' })
    assert.equal(await store.contarAdmins(), 0)
    const baneado = await store.buscarUsuarioPorId(usuario.id)
    assert.equal(baneado.role, 'admin')
    assert.equal(baneado.status, 'banned')

    const sesion = await store.crearSesionWeb({
      tokenHash: 'token-1',
      userId: usuario.id,
      csrfToken: 'csrf-1',
      expiresAt: Date.now() + 60_000,
      ip: '127.0.0.1',
      userAgent: 'test',
    }).then(() => store.obtenerSesionWeb('token-1'))
    assert.equal(sesion.id, usuario.id)
    assert.equal(sesion.csrf_token, 'csrf-1')

    const bot = await store.upsertBot({
      userId: usuario.id,
      phone: '5215512345678',
      folder: '5215512345678',
    })
    assert.equal(bot.phone, '5215512345678')
    assert.equal(bot.status, 'linked')

    const pairing = await store.crearPairing({
      id: 'pair-1',
      userId: usuario.id,
      phone: '5215512345678',
      expiresAt: Date.now() + 60_000,
    })
    assert.equal(pairing.status, 'pending')

    await store.registrarAuditoria({
      userId: usuario.id,
      action: 'auth.login',
      ip: '127.0.0.1',
      meta: { ok: true },
    })
    assert.equal((await store.listarAuditoria()).length, 1)

    await store.eliminarUsuario(usuario.id)
    assert.equal(await store.contarUsuarios(), 0)
    assert.equal(await store.contarBots(), 0)
    assert.equal((await store.pairingsRecientes()).length, 0)
    assert.equal(await store.obtenerSesionWeb('token-1'), null)
  })
})

test('webpanel store: pairings, auditoría y meta', async () => {
  await conStore(async (store) => {
    const usuario = await store.crearUsuario({ username: 'pairuser', passwordHash: 'x' })
    const ahora = Date.now()
    await store.crearPairing({
      id: 'p-1',
      userId: usuario.id,
      phone: '51999999999',
      ip: '1.2.3.4',
      expiresAt: ahora + 60_000,
    })
    await store.crearPairing({
      id: 'p-2',
      userId: usuario.id,
      phone: '51888888888',
      ip: '1.2.3.4',
      expiresAt: ahora + 60_000,
    })
    assert.equal(await store.contarPairingsRecientes({ userId: usuario.id, since: ahora - 1000 }), 2)
    assert.equal(await store.contarPairingsRecientes({ ip: '1.2.3.4', since: ahora - 1000 }), 2)
    assert.equal(await store.contarPairingsRecientes({ phone: '51999999999', since: ahora - 1000 }), 1)

    await store.actualizarPairing('p-1', {
      status: 'code_ready',
      code: '12345678',
      expiresAt: ahora + 90_000,
    })
    const pairing = await store.obtenerPairing('p-1')
    assert.equal(pairing.status, 'code_ready')
    assert.equal(pairing.code, '12345678')
    assert.equal(await store.contarPairingsActivos(), 2)
    await store.actualizarPairing('p-2', { status: 'expired' })
    assert.equal(await store.contarPairingsActivos(), 1)
    await store.actualizarPairing('p-1', { status: 'linked', linkedAt: ahora })
    assert.equal(await store.contarPairingsActivos(), 0)

    const recientes = await store.pairingsRecientes(10)
    assert.equal(recientes.length, 2)
    assert.equal(recientes[0].username, 'pairuser')

    await store.registrarAuditoria({
      userId: usuario.id,
      action: 'bot.linked',
      ip: '1.2.3.4',
      meta: { phone: '51999999999' },
    })
    const auditoria = await store.listarAuditoria()
    assert.equal(auditoria.length, 1)
    assert.equal(auditoria[0].action, 'bot.linked')
    assert.equal(JSON.parse(auditoria[0].meta).phone, '51999999999')

    await store.establecerMeta('clave', 'valor')
    assert.equal(await store.obtenerMeta('clave'), 'valor')
    await store.establecerMeta('clave', 'nuevo')
    assert.equal(await store.obtenerMeta('clave'), 'nuevo')
  })
})

test('webpanel store: limpieza de sesiones y pairings antiguos', async () => {
  await conStore(async (store) => {
    const usuario = await store.crearUsuario({ username: 'limpieza', passwordHash: 'x' })
    await store.crearSesionWeb({
      tokenHash: 'viejo',
      userId: usuario.id,
      csrfToken: 'csrf',
      expiresAt: Date.now() - 1000,
    })
    assert.equal(await store.limpiarSesionesExpiradas(), 1)

    await store.crearPairing({
      id: 'p-viejo',
      userId: usuario.id,
      phone: '51111111111',
      expiresAt: Date.now() - 1000,
    })
    await store.actualizarPairing('p-viejo', { status: 'expired' })
    const borrados = await store.limpiarPairingsAntiguos({ olderThan: Date.now() + 1000 })
    assert.equal(borrados, 1)
    assert.equal(await store.obtenerPairing('p-viejo'), null)
  })
})
