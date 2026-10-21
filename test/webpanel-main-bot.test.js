import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  MainBotError,
  desvincularPrincipal,
  estadoPrincipal,
  relinkPrincipal,
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

test('main-bot: desvincular recrea el socket sin reiniciar el proceso', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-main-unlink-'))
  const anteriorAuth = global.authFile
  const anteriorReinicio = global.reiniciarPrincipalLimpio
  global.authFile = dir
  try {
    fs.writeFileSync(path.join(dir, 'creds.json'), JSON.stringify({ registered: true }))
    let logout = false
    let recreado = false
    global.conn = {
      ws: { isOpen: true },
      authState: { creds: { registered: true, me: { id: '5215512345678:12@s.whatsapp.net' } } },
      user: { id: '5215512345678:12@s.whatsapp.net' },
      logout: async () => { logout = true },
    }
    global.reiniciarPrincipalLimpio = async () => { recreado = true; return true }

    const resultado = await desvincularPrincipal()
    assert.equal(logout, true)
    assert.equal(recreado, true)
    assert.equal(resultado.ok, true)
    assert.equal(resultado.restartRequired, false)
    assert.equal(resultado.panelOnline, true)
    assert.equal(fs.existsSync(path.join(dir, 'creds.json')), false)
  } finally {
    delete global.conn
    if (anteriorReinicio === undefined) delete global.reiniciarPrincipalLimpio
    else global.reiniciarPrincipalLimpio = anteriorReinicio
    if (anteriorAuth === undefined) delete global.authFile
    else global.authFile = anteriorAuth
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('main-bot: relink desvincula, recrea el socket y devuelve el código', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-main-relink-'))
  const anteriorAuth = global.authFile
  const anteriorReinicio = global.reiniciarPrincipalLimpio
  global.authFile = dir
  try {
    fs.writeFileSync(path.join(dir, 'creds.json'), JSON.stringify({ registered: true }))
    let recreado = false
    global.conn = {
      ws: { isOpen: true },
      authState: { creds: { registered: true, me: { id: '5215512345678:12@s.whatsapp.net' } } },
      user: { id: '5215512345678:12@s.whatsapp.net' },
      logout: async () => {},
    }
    global.reiniciarPrincipalLimpio = async () => {
      recreado = true
      // El socket nuevo ya está limpio y listo para emparejar.
      global.conn = {
        ws: { isOpen: true },
        authState: { creds: { registered: false } },
        user: {},
        requestPairingCode: async (phone) => `AB${String(phone).slice(-6)}`,
      }
      return true
    }

    const resultado = await relinkPrincipal('5215512345678')
    assert.equal(recreado, true)
    assert.equal(resultado.phone, '5215512345678')
    assert.equal(resultado.code.length, 8)
  } finally {
    delete global.conn
    if (anteriorReinicio === undefined) delete global.reiniciarPrincipalLimpio
    else global.reiniciarPrincipalLimpio = anteriorReinicio
    if (anteriorAuth === undefined) delete global.authFile
    else global.authFile = anteriorAuth
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('main-bot: espera a que el socket del principal abra (sin reiniciar)', async () => {
  const anteriorAuth = global.authFile
  global.authFile = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-main-espera-'))
  try {
    let abierto = false
    global.conn = {
      get ws() {
        return { get isOpen() { return abierto } }
      },
      authState: { creds: { registered: false } },
      user: {},
      requestPairingCode: async (phone) => `AB${String(phone).slice(-6)}`,
    }
    // El socket tarda un momento en abrir (arranque o recreación).
    setTimeout(() => { abierto = true }, 700)

    const resultado = await solicitarCodigoPrincipal('5215512345678')
    assert.equal(resultado.phone, '5215512345678')
    assert.equal(resultado.code.length, 8)
  } finally {
    delete global.conn
    if (anteriorAuth === undefined) delete global.authFile
    else global.authFile = anteriorAuth
    fs.rmSync(global.authFile || '', { recursive: true, force: true })
  }
})

test('main-bot: pide un código de emparejamiento al socket principal', async () => {
  const anteriorAuth = global.authFile
  const anteriorEspera = process.env.PAIN_WEB_MAIN_WAIT
  // La espera del socket se acorta para que el test no tarde 25 s.
  process.env.PAIN_WEB_MAIN_WAIT = '1200'
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
    if (anteriorEspera === undefined) delete process.env.PAIN_WEB_MAIN_WAIT
    else process.env.PAIN_WEB_MAIN_WAIT = anteriorEspera
    fs.rmSync(global.authFile || '', { recursive: true, force: true })
  }
})
