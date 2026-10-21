import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  MainBotError,
  estadoPrincipal,
  solicitarCodigoPrincipal,
} from '../lib/webpanel/main-bot.js'

function crearPrincipalFalso(extra = {}) {
  return {
    ws: { isOpen: true },
    authState: { creds: { registered: true, me: { id: '5215512345678:12@s.whatsapp.net' } } },
    user: { id: '5215512345678:12@s.whatsapp.net', name: 'Pain Bot' },
    requestPairingCode: async (phone) => `AB${String(phone).slice(-6)}`,
    ...extra,
  }
}

test('main-bot: el estado refleja si el principal está vinculado', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-main-'))
  const anteriorAuth = global.authFile
  global.authFile = dir
  try {
    delete global.conn
    const sinProceso = estadoPrincipal()
    assert.equal(sinProceso.available, false)
    assert.equal(sinProceso.linked, false)
    assert.equal(sinProceso.canRequestCode, false)

    global.conn = crearPrincipalFalso()
    const vinculado = estadoPrincipal()
    assert.equal(vinculado.available, true)
    assert.equal(vinculado.linked, true)
    assert.equal(vinculado.connected, true)
    assert.equal(vinculado.phone, '5215512345678')
    assert.equal(vinculado.name, 'Pain Bot')
    assert.equal(vinculado.canRequestCode, false)

    global.conn = crearPrincipalFalso({
      authState: { creds: { registered: false } },
      user: {},
    })
    const pendiente = estadoPrincipal()
    assert.equal(pendiente.linked, false)
    assert.equal(pendiente.canRequestCode, true)
  } finally {
    delete global.conn
    if (anteriorAuth === undefined) delete global.authFile
    else global.authFile = anteriorAuth
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('main-bot: pide un código de emparejamiento al socket principal', async () => {
  const anteriorAuth = global.authFile
  global.authFile = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-main-code-'))
  try {
    global.conn = crearPrincipalFalso({
      authState: { creds: { registered: false } },
      user: {},
    })
    const resultado = await solicitarCodigoPrincipal('5215512345678')
    assert.equal(resultado.phone, '5215512345678')
    assert.equal(resultado.code.length, 8)
    assert.ok(resultado.expiresIn > 0)

    await assert.rejects(
      () => solicitarCodigoPrincipal('123'),
      (error) => error instanceof MainBotError && error.code === 'invalid_phone',
    )

    global.conn = crearPrincipalFalso()
    await assert.rejects(
      () => solicitarCodigoPrincipal('5215512345678'),
      (error) => error instanceof MainBotError && error.code === 'main_already_linked',
    )

    global.conn = crearPrincipalFalso({
      ws: { isOpen: false },
      authState: { creds: { registered: false } },
      user: {},
    })
    await assert.rejects(
      () => solicitarCodigoPrincipal('5215512345678'),
      (error) => error instanceof MainBotError && error.code === 'main_socket_closed',
    )

    global.conn = crearPrincipalFalso({
      authState: { creds: { registered: false } },
      user: {},
      requestPairingCode: async () => {
        throw new Error('WhatsApp no responde')
      },
    })
    await assert.rejects(
      () => solicitarCodigoPrincipal('5215512345678'),
      (error) => error instanceof MainBotError && error.code === 'request_failed',
    )
  } finally {
    delete global.conn
    if (anteriorAuth === undefined) delete global.authFile
    else global.authFile = anteriorAuth
    fs.rmSync(global.authFile || '', { recursive: true, force: true })
  }
})
