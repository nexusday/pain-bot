import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  canalPremiumDeConexion,
  construirRcanalPremium,
  ejecutarEnContextoBot,
  instalarContextoPremium,
  limpiarCachePremium,
  textosMenuPremium,
} from '../lib/premium.js'

const RAIZ = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-premium-runtime-'))
const PREMIUM = '51911111111'
const VENCIDO = '51922222222'
const NORMAL = '51933333333'
const SIN_CANAL = '51944444444'

fs.mkdirSync(path.join(RAIZ, 'Serbot', PREMIUM), { recursive: true })
fs.writeFileSync(
  path.join(RAIZ, 'Serbot', PREMIUM, 'config.json'),
  JSON.stringify({
    premium: { expiresAt: Date.now() + 2 * 60 * 60 * 1000, ads: 2 },
    premiumEdits: {
      moneda: 'S/',
      menu: { creador: 'Creador Propio', hosting: 'Mi Hosting', donar: 'Invítame un café' },
      canal: { jid: '120363405059433072@newsletter', nombre: 'Canal Premium' },
    },
  })
)
fs.mkdirSync(path.join(RAIZ, 'Serbot', VENCIDO), { recursive: true })
fs.writeFileSync(
  path.join(RAIZ, 'Serbot', VENCIDO, 'config.json'),
  JSON.stringify({
    premium: { expiresAt: Date.now() - 5000 },
    premiumEdits: { moneda: 'PEN', menu: { creador: 'Viejo' }, canal: { jid: '120363405059433072@newsletter' } },
  })
)
fs.mkdirSync(path.join(RAIZ, 'Serbot', NORMAL), { recursive: true })
fs.writeFileSync(path.join(RAIZ, 'Serbot', NORMAL, 'config.json'), JSON.stringify({ name: 'Normal' }))
fs.mkdirSync(path.join(RAIZ, 'Serbot', SIN_CANAL), { recursive: true })
fs.writeFileSync(path.join(RAIZ, 'Serbot', SIN_CANAL, 'config.json'), JSON.stringify({
  premium: { expiresAt: Date.now() + 2 * 60 * 60 * 1000 },
  premiumEdits: { canal: { jid: '', nombre: '' } },
}))

process.chdir(RAIZ)
global.bot = 'Serbot'
instalarContextoPremium()
global.moneda = 'USD'
global.canal = { jid: '120363405059433072@newsletter', name: 'Nexo Community' }
global.rcanal = construirRcanalPremium('120363405059433072@newsletter', 'Nexo Community')

const conn = (telefono) => ({ pathAYBot: path.join(RAIZ, 'Serbot', telefono) })

test.after(() => {
  // En Windows no se puede borrar el directorio actual: se sale primero.
  try { process.chdir(os.tmpdir()) } catch {}
  fs.rmSync(RAIZ, { recursive: true, force: true })
})

test('premium runtime: moneda, canal y textos solo en el sub-bot con premium', () => {
  limpiarCachePremium()
  assert.equal(global.moneda, 'USD')
  assert.equal(global.canal.name, 'Nexo Community')

  const premium = ejecutarEnContextoBot(conn(PREMIUM), () => ({
    moneda: global.moneda,
    canal: global.canal,
    etiqueta: global.rcanal.contextInfo.forwardedNewsletterMessageInfo,
    textos: textosMenuPremium(),
  }))
  assert.equal(premium.moneda, 'S/')
  assert.equal(premium.canal.nombre, 'Canal Premium')
  assert.equal(premium.etiqueta.newsletterName, 'Canal Premium')
  assert.deepEqual(premium.textos, {
    creador: 'Creador Propio',
    hosting: 'Mi Hosting',
    donar: 'Invítame un café',
  })

  // Fuera del contexto (y en un bot sin premium) se mantienen los globales.
  assert.equal(global.moneda, 'USD')
  const normal = ejecutarEnContextoBot(conn(NORMAL), () => ({
    moneda: global.moneda,
    textos: textosMenuPremium(),
    etiqueta: global.rcanal.contextInfo.forwardedNewsletterMessageInfo.newsletterName,
  }))
  assert.equal(normal.moneda, 'USD')
  assert.equal(normal.textos, null)
  assert.equal(normal.etiqueta, 'Nexo Community')
})

test('premium runtime: al caducar se aplica el valor global al instante', () => {
  limpiarCachePremium()
  const vencido = ejecutarEnContextoBot(conn(VENCIDO), () => ({
    moneda: global.moneda,
    textos: textosMenuPremium(),
    canal: canalPremiumDeConexion(conn(VENCIDO)),
  }))
  assert.equal(vencido.moneda, 'USD')
  assert.equal(vencido.textos, null)
  assert.equal(vencido.canal, null)
})

test('premium runtime: dos sub-bots a la vez no se pisan la moneda', async () => {
  limpiarCachePremium()
  const resultados = await Promise.all([
    new Promise((resolver) => setTimeout(() => resolver(
      ejecutarEnContextoBot(conn(PREMIUM), () => global.moneda)
    ), 40)),
    new Promise((resolver) => setTimeout(() => resolver(
      ejecutarEnContextoBot(conn(NORMAL), () => global.moneda)
    ), 10)),
    new Promise((resolver) => setTimeout(() => resolver(
      ejecutarEnContextoBot(conn(PREMIUM), () => global.moneda)
    ), 25)),
  ])
  assert.deepEqual(resultados, ['S/', 'USD', 'S/'])
})

test('premium runtime: el canal premium se sigue al conectar', () => {
  limpiarCachePremium()
  assert.deepEqual(canalPremiumDeConexion(conn(PREMIUM)), {
    jid: '120363405059433072@newsletter',
    nombre: 'Canal Premium',
  })
  assert.equal(canalPremiumDeConexion(conn(NORMAL)), null)
})

test('premium runtime: canal vacío desactiva el canal oficial', () => {
  limpiarCachePremium()
  const resultado = ejecutarEnContextoBot(conn(SIN_CANAL), () => ({
    canal: global.canal,
    rcanal: global.rcanal,
    conectado: canalPremiumDeConexion(conn(SIN_CANAL)),
  }))
  assert.equal(resultado.canal, null)
  assert.deepEqual(resultado.rcanal, { contextInfo: {} })
  assert.equal(resultado.conectado, null)
})

test('premium runtime: los textos del menú se usan en el encabezado', async () => {
  limpiarCachePremium()
  const { construirEncabezadoMenu } = await import('../lib/menu-categories.js')
  const ctx = (textos) => ({
    uso: '', usedPrefix: '.', lang: 'es',
    nombreBot: 'PAIN BOT', tipo: 'Sub Bot', ping: '10 ms', userRole: 'usuario',
    botFormatUptime: '1h', totalf: 10, processRamMB: 100, totalRamMB: 8000,
    rentalLine: '', esPrincipal: false, esOwnerConfig: false, esPropietario: false,
    ...(textos ? { textos } : {}),
  })
  const m = { sender: '5215500000000@s.whatsapp.net' }
  const normal = construirEncabezadoMenu(m, ctx(null))
  assert.ok(normal.includes('Sunkovv'))
  assert.ok(normal.includes('Nexcodea'))
  assert.ok(normal.includes('https://whatsapp.com/channel/120363405059433072'))

  const personalizado = construirEncabezadoMenu(m, ctx({ creador: 'Creador Propio', hosting: 'Mi Hosting', donar: 'Invítame un café' }))
  assert.ok(personalizado.includes('Creador Propio'))
  assert.ok(personalizado.includes('Mi Hosting'))
  assert.ok(personalizado.includes('Invítame un café'))
  // El texto del creador cambia; el enlace del proyecto sigue igual (a
  // propósito: los enlaces no se editan para evitar phishing).
  assert.ok(!personalizado.includes('`Sunkovv`'))

  // En el bot real, sin ctx.textos, entra el contexto premium del mensaje.
  const desdeContexto = ejecutarEnContextoBot(conn(PREMIUM), () => construirEncabezadoMenu(m, ctx(null)))
  assert.ok(desdeContexto.includes('Creador Propio'))
})

test('premium runtime: el encabezado omite el canal cuando premium lo deja vacío', async () => {
  limpiarCachePremium()
  const { construirEncabezadoMenu } = await import('../lib/menu-categories.js')
  const ctx = {
    uso: '', usedPrefix: '.', lang: 'es', nombreBot: 'PAIN BOT', tipo: 'Sub Bot',
    ping: '10 ms', userRole: 'usuario', botFormatUptime: '1h', totalf: 10,
    processRamMB: 100, totalRamMB: 8000, rentalLine: '', esPrincipal: false,
    esOwnerConfig: false, esPropietario: false,
  }
  const m = { sender: '5215500000000@s.whatsapp.net' }
  const texto = ejecutarEnContextoBot(conn(SIN_CANAL), () => construirEncabezadoMenu(m, ctx))
  assert.ok(!texto.includes('https://whatsapp.com/channel/'))
})

test('premium runtime: el texto completo del menú manda sobre el por defecto', async () => {
  limpiarCachePremium()
  const ruta = path.join(RAIZ, 'Serbot', PREMIUM, 'config.json')
  const original = JSON.parse(fs.readFileSync(ruta, 'utf8'))
  fs.writeFileSync(ruta, JSON.stringify({
    ...original,
    premiumEdits: {
      moneda: 'S/',
      menu: { texto: '*{nombre}*\nHola {usuario}\nrol: {rol}\n{panel}\nhttps://wa.me/Sunkovv' },
    },
  }))
  limpiarCachePremium()

  const { construirEncabezadoMenu } = await import('../lib/menu-categories.js')
  const ctx = {
    lang: 'es', usedPrefix: '.', nombreBot: 'Mi Bot Premium', tipo: 'Sub Bot',
    ping: '5 ms', userRole: 'usuario', botFormatUptime: '2 h', totalf: 42,
    processRamMB: 10, totalRamMB: 100, rentalLine: '',
    esPrincipal: false, esOwnerConfig: false, esPropietario: false,
  }
  const m = { sender: '5215500000000@s.whatsapp.net' }

  const texto = ejecutarEnContextoBot(conn(PREMIUM), () => construirEncabezadoMenu(m, ctx))
  assert.ok(texto.startsWith('*Mi Bot Premium*'), 'el texto personalizado reemplaza el menú')
  assert.ok(texto.includes('Hola @5215500000000'), 'los tokens se resuelven')
  assert.ok(texto.includes('rol: usuario'))
  assert.ok(texto.includes('https://wa.me/Sunkovv'), 'los enlaces se conservan')
  assert.ok(!texto.includes('creador'), 'no se mezcla con el menú por defecto')

  // Otros sub-bots siguen viendo el menú original del bot.
  const normal = ejecutarEnContextoBot(conn(NORMAL), () => construirEncabezadoMenu(m, ctx))
  assert.ok(normal.includes('creador'))
  assert.ok(normal.includes('wa.me/Sunkovv'))

  fs.writeFileSync(ruta, JSON.stringify(original, null, 2))
  limpiarCachePremium()
})
