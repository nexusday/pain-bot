import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ArchivoSqliteCompartido } from '../lib/db-sqlite.js'

async function preparar() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pain-dirty-'))
  const sqlite = path.join(dir, 'db.sqlite')
  const legacy = path.join(dir, 'db.json')
  const adapter = new ArchivoSqliteCompartido(sqlite, legacy, { persistConnections: false })
  return { dir, sqlite, legacy, adapter }
}

test('db: el primer write persiste usuarios y chats completos', async () => {
  const { dir, sqlite, legacy, adapter } = await preparar()
  try {
    await adapter.write({
      users: { a: { coins: 1 }, b: { coins: 2 }, c: { coins: 3 } },
      chats: { g: { antiLink: true } },
      settings: { moneda: 'USD' },
    })
    const vivos = await adapter.read()
    assert.deepEqual(Object.keys(vivos.users).sort(), ['a', 'b', 'c'])
    assert.equal(vivos.chats.g.antiLink, true)
    await adapter.close()

    const reabierto = new ArchivoSqliteCompartido(sqlite, legacy, { persistConnections: false })
    const datos = await reabierto.read()
    assert.deepEqual(Object.keys(datos.users).sort(), ['a', 'b', 'c'])
    assert.equal(datos.users.b.coins, 2)
    await reabierto.close()
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('db: guarda solo la entidad tocada, no todo el catálogo', async () => {
  const { dir, sqlite, legacy, adapter } = await preparar()
  try {
    await adapter.write({
      users: { a: { coins: 1 }, b: { coins: 2 }, c: { coins: 3 } },
      chats: {},
    })
    const vivos = await adapter.read()
    vivos.users.a.coins = 99
    const antes = adapter.estadisticas.entidades
    await adapter.write(vivos)
    const delta = adapter.estadisticas.entidades - antes
    assert.ok(delta <= 2, `esperaba <=2 entidades detectadas, fueron ${delta}`)
    await adapter.close()

    const reabierto = new ArchivoSqliteCompartido(sqlite, legacy, { persistConnections: false })
    const datos = await reabierto.read()
    assert.equal(datos.users.a.coins, 99)
    assert.equal(datos.users.b.coins, 2)
    assert.equal(datos.users.c.coins, 3)
    await reabierto.close()
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('db: leer un usuario no lo marca como sucio', async () => {
  const { dir, sqlite, legacy, adapter } = await preparar()
  try {
    await adapter.write({
      users: { a: { coins: 1 }, b: { coins: 2 } },
      chats: {},
    })
    const vivos = await adapter.read()
    // Lecturas (incluidas las de este test) no deben generar escrituras.
    void vivos.users.a.coins
    void vivos.users.b.coins
    const antes = adapter.estadisticas.entidades
    await adapter.write(vivos)
    assert.equal(adapter.estadisticas.entidades, antes)
    await adapter.close()
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('db: bienvenidas se guarda por chat y no reescribe todos los grupos', async () => {
  const { dir, sqlite, legacy, adapter } = await preparar()
  try {
    await adapter.write({
      users: {},
      chats: {},
      bienvenidas: {
        '1@g.us': { enabled: true, welcomeMsg: 'hola' },
        '2@g.us': { enabled: true, welcomeMsg: 'hello' },
      },
    })
    const vivos = await adapter.read()
    vivos.bienvenidas['1@g.us'].welcomeMsg = 'hola editado'
    await adapter.write(vivos)
    await adapter.close()

    const reabierto = new ArchivoSqliteCompartido(sqlite, legacy, { persistConnections: false })
    const datos = await reabierto.read()
    assert.equal(datos.bienvenidas['1@g.us'].welcomeMsg, 'hola editado')
    assert.equal(datos.bienvenidas['2@g.us'].welcomeMsg, 'hello')
    await reabierto.close()
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('db: modo escritor único persiste sin baseline duplicado', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pain-single-'))
  const sqlite = path.join(dir, 'db.sqlite')
  const legacy = path.join(dir, 'db.json')
  try {
    const adapter = new ArchivoSqliteCompartido(sqlite, legacy, {
      persistConnections: false,
      singleWriter: true,
    })
    await adapter.write({
      users: { 'a@s.whatsapp.net': { coins: 1 }, 'b@s.whatsapp.net': { coins: 2 } },
      chats: {},
    })
    const vivos = await adapter.read()
    vivos.users['a@s.whatsapp.net'].coins = 50
    await adapter.write(vivos)
    await adapter.close()

    const reabierto = new ArchivoSqliteCompartido(sqlite, legacy, { persistConnections: false })
    const datos = await reabierto.read()
    assert.equal(datos.users['a@s.whatsapp.net'].coins, 50)
    assert.equal(datos.users['b@s.whatsapp.net'].coins, 2)
    await reabierto.close()
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('db: propaga el borrado de una entidad', async () => {
  const { dir, sqlite, legacy, adapter } = await preparar()
  try {
    await adapter.write({ users: { a: { coins: 1 }, b: { coins: 2 } }, chats: {} })
    const vivos = await adapter.read()
    delete vivos.users.b
    await adapter.write(vivos)
    await adapter.close()

    const reabierto = new ArchivoSqliteCompartido(sqlite, legacy, { persistConnections: false })
    const datos = await reabierto.read()
    assert.deepEqual(Object.keys(datos.users), ['a'])
    await reabierto.close()
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})
