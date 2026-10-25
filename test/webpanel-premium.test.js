import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { setTimeout as delay } from 'node:timers/promises'
import { startWebPanel } from '../lib/webpanel/server.js'
import { hashPassword } from '../lib/webpanel/auth.js'
import { guardarConfigSubBot } from '../lib/webpanel/subbot-config.js'
import {
  PREMIUM_DEFECTOS,
  estadoPremium,
  extraerAnuncio,
  guardarAjustesPremium,
  leerAjustesPremium,
  normalizarEdiciones,
  sumarPremium,
  validarEdiciones,
  validarEntradasAnuncios,
} from '../lib/webpanel/premium.js'

const PHONE = '5215512345678'
const PHONE_OTRO = '5215599999999'

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-premium-panel-'))
const ROOT = path.join(DIR, 'Serbot')
const handle = await startWebPanel({
  host: '127.0.0.1',
  port: 0,
  dataDir: DIR,
  root: ROOT,
  publicUrl: 'https://panel.example.com',
  adminUser: 'admin',
  adminPass: 'admin12345',
})
const BASE = `http://127.0.0.1:${handle.server.address().port}`

test.after(async () => {
  await handle.close()
  fs.rmSync(DIR, { recursive: true, force: true })
})

async function pedir(route, sesion, method = 'GET', body) {
  const res = await fetch(BASE + route, {
    method,
    headers: { 'content-type': 'application/json', ...(sesion || {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const texto = await res.text()
  let datos = null
  try { datos = JSON.parse(texto) } catch {}
  return { res, datos, texto }
}

async function entrar(username, password) {
  const login = await pedir('/api/auth/login', null, 'POST', { username, password })
  assert.equal(login.res.status, 200, `login ${username}`)
  return { cookie: login.res.headers.get('set-cookie').split(';')[0], 'x-csrf-token': login.datos.csrf }
}

const sesionAdmin = await entrar('admin', 'admin12345')
const pass = await hashPassword('duenopassword1')
const dueno = await handle.store.crearUsuario({
  username: 'dueno',
  email: 'dueno@example.com',
  passwordHash: pass,
  role: 'user',
})
await handle.store.upsertBot({ phone: PHONE, folder: PHONE, userId: dueno.id, status: 'linked' })
const sesionDueno = await entrar('dueno', 'duenopassword1')

test('premium: ediciones válidas, banco con tope y persistencia al caducar', async () => {
  const ediciones = validarEdiciones({
    moneda: 'S/',
    menu: { creador: 'Mi Creador', hosting: 'Mi Hosting', donar: 'Apóyame' },
    canal: { jid: 'https://whatsapp.com/channel/0029Vb7Y87RLikgEutyMId1h', nombre: 'Canal Premium' },
  })
  assert.equal(ediciones.moneda, 'S/')
  assert.equal(ediciones.canal.jid, '0029Vb7Y87RLikgEutyMId1h@newsletter')

  // Un enlace en los textos del menú abre la puerta a phishing: se rechaza.
  for (const entrada of [
    { menu: { creador: 'https://evil.example' } },
    { menu: { hosting: 'wa.me/12345' } },
    { menu: { donar: 'escribe a @soporte_falso' } },
    { moneda: 'USD<script>' },
    { canal: { jid: 'no-es-un-canal' } },
  ]) {
    assert.throws(() => validarEdiciones(entrada))
  }
  // El texto completo del menú sí admite saltos de línea y enlaces: es el
  // texto que verá el grupo, no un campo corto.
  const menuCompleto = validarEdiciones({
    menu: { texto: '*Mi bot*\nEscribe en https://wa.me/1234\n¡hola!' },
  })
  assert.ok(menuCompleto.menu.texto.includes('\n'))
  assert.ok(menuCompleto.menu.texto.includes('https://wa.me/1234'))
  assert.throws(() => validarEdiciones({ menu: { texto: 'x'.repeat(4001) } }))
  assert.equal(validarEdiciones({ menu: { texto: '' } }).menu.texto, '')

  // La lectura del config es tolerante: descarta lo inválido y conserva el resto.
  const tolerante = normalizarEdiciones({
    moneda: 'PEN',
    menu: { creador: 'https://evil.example', hosting: 'Hosting OK' },
  })
  assert.equal(tolerante.moneda, 'PEN')
  assert.equal(tolerante.menu.creador, '')
  assert.equal(tolerante.menu.hosting, 'Hosting OK')

  // Banco: 24 h de tope y suma de 60 min.
  guardarConfigSubBot(ROOT, PHONE, { premium: { expiresAt: 0 }, premiumEdits: ediciones })
  const ajustes = { ...PREMIUM_DEFECTOS, maxHours: 24, unlockHours: 10, adMinutes: 60 }
  let estado = estadoPremium(ROOT, PHONE, ajustes)
  assert.equal(estado.activo, false)
  assert.equal(estado.puedeSumar, true)
  estado = sumarPremium(ROOT, PHONE, 60, ajustes)
  assert.equal(estado.activo, true)
  assert.ok(estado.restanteMs > 59 * 60 * 1000 && estado.restanteMs <= 60 * 60 * 1000)
  assert.equal(estado.anuncios, 1)
  for (let i = 0; i < 40; i++) estado = sumarPremium(ROOT, PHONE, 60, ajustes)
  assert.ok(estado.restanteMs <= 24 * 60 * 60 * 1000 + 1000, 'el banco no pasa del tope')
  assert.equal(estado.bloqueado, true)
  assert.equal(estado.puedeSumar, false)

  // Al caducar, las ediciones siguen guardadas pero dejan de aplicarse.
  guardarConfigSubBot(ROOT, PHONE, { premium: { expiresAt: Date.now() - 1000 } })
  const vencido = estadoPremium(ROOT, PHONE, ajustes)
  assert.equal(vencido.activo, false)
  assert.equal(vencido.ediciones.canal.nombre, 'Canal Premium')
})

test('premium: ajustes del servidor respetan los límites y validan URLs', async () => {
  const guardado = await guardarAjustesPremium(handle.store, {
    adMinutes: 5000,
    adSeconds: 1,
    maxHours: 0,
    unlockHours: 999,
    smartlink: 'javascript:alert(1)',
  })
  assert.equal(guardado.adMinutes, 1440)
  assert.equal(guardado.adSeconds, 3)
  assert.equal(guardado.maxHours, 1)
  assert.ok(guardado.unlockHours < guardado.maxHours, 'el desbloqueo nunca queda por encima del tope')
  assert.equal(guardado.smartlink, '', 'solo se aceptan URLs http(s)')

  const conBanners = await guardarAjustesPremium(handle.store, {
    adMinutes: 60,
    adSeconds: 3,
    maxHours: 24,
    unlockHours: 10,
    cooldownSeconds: 0,
    smartlink: 'https://www.effectiveratecpm.com/abc123',
    banners: { small: 'https://www.highperformanceformat.com/31905924/invoke.js', medium: '', native: '' },
  })
  assert.equal(conBanners.banners.small, 'https://www.highperformanceformat.com/31905924/invoke.js')
  const leido = await leerAjustesPremium(handle.store)
  assert.equal(leido.adMinutes, 60)
  assert.equal(leido.smartlink, 'https://www.effectiveratecpm.com/abc123')
})

test('premium: los bloques de Adsterra se entienden, se validan y se publican', async () => {
  // 1) Lo que pega el administrador (bloque con div, bloque atOptions, URL…).
  const scriptDiv = [
    '<script async="async" data-cfasync="false" src="https://spaceshipgoldenthou.com/60b45c9f3559fa9394c464f10b353bde/invoke.js"></script>',
    '<div id="container-60b45c9f3559fa9394c464f10b353bde"></div>',
  ].join(String.fromCharCode(10))
  const atOptions = [
    '<script>',
    "  atOptions = { 'key' : '1514daf131b2a79196e7b9bbae7c2ee2', 'format' : 'iframe', 'height' : 50, 'width' : 320 };",
    '</script>',
    '<script src="https://spaceshipgoldenthou.com/1514daf131b2a79196e7b9bbae7c2ee2/invoke.js"></script>',
  ].join(String.fromCharCode(10))

  assert.equal(
    extraerAnuncio(scriptDiv).src,
    'https://spaceshipgoldenthou.com/60b45c9f3559fa9394c464f10b353bde/invoke.js'
  )
  assert.equal(extraerAnuncio(scriptDiv).contenedor, 'container-60b45c9f3559fa9394c464f10b353bde')
  assert.equal(
    extraerAnuncio(atOptions).src,
    'https://spaceshipgoldenthou.com/1514daf131b2a79196e7b9bbae7c2ee2/invoke.js'
  )
  assert.equal(extraerAnuncio('//pl.ejemplo.com/abc/invoke.js').src, 'https://pl.ejemplo.com/abc/invoke.js')
  assert.equal(extraerAnuncio('https://pl.ejemplo.com/abc/invoke.js').src, 'https://pl.ejemplo.com/abc/invoke.js')
  assert.equal(extraerAnuncio('esto no es un anuncio'), null)
  assert.equal(extraerAnuncio(''), null)
  assert.equal(validarEntradasAnuncios({ banners: { small: scriptDiv } }), true)
  assert.throws(() => validarEntradasAnuncios({ banners: { medium: 'texto ilegible' } }))

  // 2) Guardado desde el panel: el bloque pegado se guarda…
  const conBloque = await pedir('/api/admin/settings', sesionAdmin, 'PATCH', {
    premium: { banners: { small: scriptDiv, native: atOptions } },
  })
  assert.equal(conBloque.res.status, 200)
  assert.equal(
    conBloque.datos.premium.banners.small,
    'https://spaceshipgoldenthou.com/60b45c9f3559fa9394c464f10b353bde/invoke.js'
  )
  assert.equal(conBloque.datos.premium.contenedores.small, 'container-60b45c9f3559fa9394c464f10b353bde')
  assert.ok(conBloque.datos.premium.banners.native.includes('1514daf131b2a79196e7b9bbae7c2ee2'))
  assert.equal(conBloque.datos.premium.opciones.native.key, '1514daf131b2a79196e7b9bbae7c2ee2')
  assert.equal(conBloque.datos.premium.opciones.native.width, 320)
  assert.equal(conBloque.datos.premium.opciones.native.height, 50)
  const reGuardado = await guardarAjustesPremium(handle.store, { banners: conBloque.datos.premium.banners })
  assert.deepEqual(reGuardado.opciones.native, conBloque.datos.premium.opciones.native)
  assert.equal(reGuardado.contenedores.small, conBloque.datos.premium.contenedores.small)
  // …y lo ilegible se rechaza con el motivo, nunca se guarda vacío en silencio.
  const ilegible = await pedir('/api/admin/settings', sesionAdmin, 'PATCH', {
    premium: { banners: { medium: 'esto no es un anuncio' } },
  })
  assert.equal(ilegible.res.status, 400)
  assert.equal(ilegible.datos.code, 'invalid_premium_banner')
  assert.match(ilegible.datos.error, /160 × 300/)

  // 3) El iframe usa el contenedor que traía el bloque.
  const marco = await fetch(`${BASE}/api/premium/frame?b=small`)
  assert.equal(marco.status, 200)
  const htmlMarco = await marco.text()
  assert.match(htmlMarco, /id="container-60b45c9f3559fa9394c464f10b353bde"/)
  assert.match(htmlMarco, /var atOptions =/)
  assert.match(htmlMarco, /"key":"60b45c9f3559fa9394c464f10b353bde"/)
  const marcoNative = await fetch(`${BASE}/api/premium/frame?b=native`)
  const htmlNative = await marcoNative.text()
  assert.match(htmlNative, /var atOptions =/)
  // document.write debe ocurrir dentro del contenedor, no después de un
  // bloque vacío que desplaza el anuncio fuera del viewport del iframe.
  assert.ok(htmlNative.indexOf('var atOptions =') > htmlNative.indexOf('<div id="contenedor">'))
  const posicionScript = htmlNative.indexOf('/invoke.js" onerror=')
  assert.ok(posicionScript > 0 && posicionScript < htmlNative.indexOf('</div></div>'))
  const monitor = htmlNative.slice(htmlNative.indexOf('(function(){'), htmlNative.lastIndexOf('</script>'))
  const mensajes = []
  const pendientes = []
  vm.runInNewContext(monitor, {
    window: { painAdScriptFailed: true, addEventListener() {} },
    document: { querySelectorAll: () => [] },
    parent: { postMessage: (mensaje) => mensajes.push(mensaje) },
    setTimeout: (fn) => pendientes.push(fn),
  })
  pendientes.forEach((fn) => fn())
  assert.equal(mensajes.length, 1)
  assert.equal(mensajes[0].reason, 'script_error')
  assert.equal(mensajes[0].ok, false)
  assert.match(htmlNative, /#contenedor\{width:320px;height:50px;/)
  assert.match(htmlNative, /1514daf131b2a79196e7b9bbae7c2ee2/)

  // 4) /api/config publica las zonas para el Dashboard y "Mis bots".
  const config = await pedir('/api/config')
  assert.equal(config.res.status, 200)
  assert.ok(config.datos.adsBanners.small.includes('60b45c9f3559fa9394c464f10b353bde'))
  assert.ok(config.datos.adsBanners.native.includes('1514daf131b2a79196e7b9bbae7c2ee2'))
})

test('premium: ubicaciones por página se guardan y publican sin perder otras zonas', async () => {
  const respuesta = await pedir('/api/admin/settings', sesionAdmin, 'PATCH', {
    premium: { placements: { communities: { header: false, footer: true }, account: { header: false, footer: false } } },
  })
  assert.equal(respuesta.res.status, 200)
  const guardado = await leerAjustesPremium(handle.store)
  assert.deepEqual(guardado.placements.account, { header: false, footer: false })
  assert.deepEqual(guardado.placements.bots, { header: true, footer: true })
  await guardarAjustesPremium(handle.store, { placements: { communities: { footer: false } } })
  const config = await pedir('/api/config')
  assert.deepEqual(config.datos.adsPlacements.communities, { header: false, footer: false })
  assert.deepEqual(config.datos.adsPlacements.account, { header: false, footer: false })
})

test('premium: cabecera automática y pie respetan página, espacio y duplicados', () => {
  const fuente = fs.readFileSync(new URL('../webpanel/public/assets/js/pages-premium.js', import.meta.url), 'utf8')
  const funciones = fuente.slice(fuente.indexOf('function marcoAnuncio'), fuente.indexOf('export async function renderPremium')).replaceAll('export function', 'function')
  for (const [ancho, formato] of [[1366, 'leaderboard'], [650, 'wide'], [390, 'small'], [360, 'small'], [352, 'small']]) {
    const contexto = vm.createContext({
      setTimeout: () => 0,
      state: { config: { adsBanners: { leaderboard: 'url', wide: 'url', small: 'url' }, adsPlacements: { account: { header: false, footer: false }, communities: { header: false, footer: true } } } },
      window: { innerWidth: ancho, location: { hash: '#/bots' } },
      document: { querySelector: () => null },
    })
    vm.runInContext(funciones, contexto)
    assert.match(vm.runInContext('anunciosCabeceraHTML()', contexto), new RegExp(`premium-ad-${formato}`))
    assert.equal(vm.runInContext('anunciosPieHTML()', contexto).includes('<iframe'), formato !== 'small')
    assert.equal(vm.runInContext("anunciosCabeceraHTML('account') + anunciosPieHTML('account')", contexto), '')
    assert.equal(vm.runInContext("anunciosCabeceraHTML('communities')", contexto), '')
    assert.match(vm.runInContext("anunciosPieHTML('communities')", contexto), /premium-ad-small/)
    // Medir el contenido real, no adivinar el espacio por el viewport.
    contexto.document.querySelector = (selector) => selector === '.content' ? { clientWidth: 360 } : null
    contexto.window.getComputedStyle = () => ({ paddingLeft: '16px', paddingRight: '16px' })
    assert.match(vm.runInContext('anunciosCabeceraHTML()', contexto), /premium-ad-small/)
    assert.match(vm.runInContext("anunciosPieHTML('communities')", contexto), /premium-ad-small/)
    contexto.document.querySelector = () => ({ clientWidth: 320 })
    assert.equal(vm.runInContext('anunciosCabeceraHTML()', contexto), '')
    assert.equal(vm.runInContext("anunciosPieHTML('communities')", contexto), '')
  }
})

test('premium: una cabecera sin contenido prueba el pequeño y elimina el hueco si falla', () => {
  const fuente = fs.readFileSync(new URL('../webpanel/public/assets/js/pages-premium.js', import.meta.url), 'utf8')
  const funciones = fuente.slice(fuente.indexOf('function marcoAnuncio'), fuente.indexOf('export async function renderPremium')).replaceAll('export function', 'function')
  const timers = []
  let recibir
  let pieEliminado = false
  const avisos = []
  const marco = { contentWindow: {} }
  const zona = { dataset: {}, isConnected: true, innerHTML: '', querySelector: () => marco, classList: { add: () => {} }, remove() { this.isConnected = false } }
  const contexto = vm.createContext({
    mostrarAvisoBloqueador: (motivo) => avisos.push(motivo),
    medirBloqueador: () => false,
    setTimeout: (fn) => { timers.push(fn); return timers.length }, clearTimeout: () => {},
    state: { config: { adsBanners: { small: 'url' } } },
    window: { innerWidth: 1366, addEventListener: (_, fn) => { recibir = fn }, removeEventListener: () => {} },
    document: { querySelector: (selector) => selector === '.ads-header' ? zona : selector === '.ads-inline' ? { remove: () => { pieEliminado = true } } : null },
  })
  vm.runInContext(funciones, contexto)
  vm.runInContext("prepararZonaAnuncio('.ads-header', true)", contexto)
  timers.shift()()
  recibir({ source: {}, data: { pain: 'ad', ok: true } })
  assert.equal(zona.innerHTML, '')
  timers.shift()()
  assert.match(zona.innerHTML, /premium-ad-small/)
  assert.equal(pieEliminado, true)
  recibir({ source: {}, data: { pain: 'ad', ok: false, reason: 'script_error' } })
  assert.equal(avisos.length, 0)
  recibir({ source: marco.contentWindow, data: { pain: 'ad', ok: false, reason: 'script_error' } })
  assert.deepEqual(avisos, ['script_error'])
  assert.equal(zona.isConnected, false)
})

test('premium: aviso de financiación se muestra una vez y permite recargar', () => {
  const fuente = fs.readFileSync(new URL('../webpanel/public/assets/js/pages-premium.js', import.meta.url), 'utf8')
  let modal, veces = 0, recargas = 0, clic
  const boton = { addEventListener: (_, fn) => { clic = fn }, focus() {} }
  const contexto = vm.createContext({
    icon: () => '',
    openModal: (opciones) => { modal = opciones; veces++ },
    window: { location: { reload: () => { recargas++ } } },
  })
  vm.runInContext(fuente.slice(fuente.indexOf('let avisoBloqueadorMostrado'), fuente.indexOf('function pintarEstadoBloqueador')), contexto)
  vm.runInContext('mostrarAvisoBloqueador(); mostrarAvisoBloqueador()', contexto)
  assert.equal(veces, 1)
  assert.match(modal.body, /Los anuncios financian/)
  assert.match(modal.footer, /Ya desactivé el bloqueador/)
  assert.equal(modal.dismissible, false)
  assert.doesNotMatch(modal.footer, /Ahora no|modal-close/)
  modal.onMount({ querySelector: () => boton })
  clic()
  assert.equal(recargas, 1)
  assert.equal(boton.disabled, true)
})

test('premium: el modal obligatorio no se cierra ni se sustituye y bloquea el fondo', () => {
  const fuente = fs.readFileSync(new URL('../webpanel/public/assets/js/core.js', import.meta.url), 'utf8')
  const modalRoot = { dataset: {}, innerHTML: '', classList: { add() {}, remove() {} } }
  const app = { inert: false }
  const contexto = vm.createContext({ modalRoot, app, state: {}, h: (s) => s, icon: () => '' })
  vm.runInContext(fuente.slice(fuente.indexOf('export function openModal'), fuente.indexOf('export function confirmModal')).replaceAll('export function', 'function'), contexto)
  vm.runInContext("openModal({title:'Normal',body:'Prueba'}); closeModal()", contexto)
  assert.equal(modalRoot.innerHTML, '')
  vm.runInContext("openModal({title:'Anuncios',body:'Permite anuncios',dismissible:false})", contexto)
  const html = modalRoot.innerHTML
  assert.doesNotMatch(html, /data-action="modal-close"/)
  assert.equal(app.inert, true)
  vm.runInContext("closeModal(); openModal({title:'Otro',body:'Otro'})", contexto)
  assert.equal(modalRoot.innerHTML, html)
})

test('premium: ciclo de anuncio, tope, bloqueador y aislamiento entre usuarios', async () => {
  const estado = await pedir('/api/premium', sesionDueno)
  assert.equal(estado.res.status, 200)
  assert.equal(estado.datos.rules.adSeconds, 3)
  assert.equal(estado.datos.rules.adMinutes, 60)
  assert.equal(estado.datos.bots.length, 1)
  assert.equal(estado.datos.bots[0].phone, PHONE)
  assert.equal(estado.datos.bots[0].active, false)
  assert.equal(estado.datos.adsAvailable, true)
  // El panel envía el menú por defecto con {tokens} para poder editarlo.
  assert.ok(estado.datos.menuTemplate.includes('{nombre}'))
  assert.ok(estado.datos.menuTemplate.includes('{usuario}'))
  assert.ok(estado.datos.menuTemplate.includes('creador'))

  // El premium no puede consultarse sin sesión.
  assert.equal((await pedir('/api/premium')).res.status, 401)

  // Guardar personalización sin premium: se guarda, no se aplica.
  const malo = await pedir(`/api/premium/${PHONE}`, sesionDueno, 'PATCH', {
    moneda: 'S/',
    menu: { creador: 'https://evil.example' },
  })
  assert.equal(malo.res.status, 400)
  assert.equal(malo.datos.code, 'invalid_premium_text')

  const bueno = await pedir(`/api/premium/${PHONE}`, sesionDueno, 'PATCH', {
    moneda: 'S/',
    menu: { creador: 'Creador Propio', hosting: 'Mi Hosting', donar: 'Invítame un café' },
    canal: { jid: '120363405059433072@newsletter', nombre: 'Canal Premium' },
  })
  assert.equal(bueno.res.status, 200)
  assert.equal(bueno.datos.active, false)
  assert.equal(bueno.datos.edits.moneda, 'S/')
  assert.equal(bueno.datos.applied, false)

  // Iniciar anuncio: token único por usuario y bot.
  const inicio = await pedir('/api/premium/ad/start', sesionDueno, 'POST', { phone: PHONE })
  assert.equal(inicio.res.status, 200)
  assert.ok(inicio.datos.token)
  assert.equal(inicio.datos.seconds, 3)
  const inicio2 = await pedir('/api/premium/ad/start', sesionDueno, 'POST', { phone: PHONE })
  assert.equal(inicio2.datos.token, inicio.datos.token, 'no se abren dos anuncios a la vez')

  // Reclamar antes de tiempo: rechazado (el contador lo manda el servidor).
  const pronto = await pedir('/api/premium/ad/claim', sesionDueno, 'POST', {
    phone: PHONE,
    token: inicio.datos.token,
  })
  assert.equal(pronto.res.status, 425)
  assert.equal(pronto.datos.code, 'premium_ad_too_fast')

  // Bloqueador de anuncios detectado por el navegador: no se entrega tiempo.
  const conBloqueador = await pedir('/api/premium/ad/claim', sesionDueno, 'POST', {
    phone: PHONE,
    token: inicio.datos.token,
    blocked: true,
  })
  assert.equal(conBloqueador.res.status, 403)
  assert.equal(conBloqueador.datos.code, 'premium_adblock')

  await delay(4100)
  const reclamado = await pedir('/api/premium/ad/claim', sesionDueno, 'POST', {
    phone: PHONE,
    token: inicio.datos.token,
  })
  assert.equal(reclamado.res.status, 200)
  assert.equal(reclamado.datos.grantedMinutes, 60)
  assert.equal(reclamado.datos.active, true)
  assert.ok(reclamado.datos.remainingMs > 59 * 60 * 1000)
  // Las ediciones guardadas pasan a aplicarse solas.
  assert.equal(reclamado.datos.applied, true)
  assert.equal(reclamado.datos.edits.menu.creador, 'Creador Propio')

  // El token es de un solo uso.
  const repetido = await pedir('/api/premium/ad/claim', sesionDueno, 'POST', {
    phone: PHONE,
    token: inicio.datos.token,
  })
  assert.equal(repetido.res.status, 410)

  // Con más del desbloqueo (10 h) no se puede sumar más tiempo.
  guardarConfigSubBot(ROOT, PHONE, { premium: { expiresAt: Date.now() + 12 * 60 * 60 * 1000 } })
  const porEncima = await pedir('/api/premium/ad/start', sesionDueno, 'POST', { phone: PHONE })
  assert.equal(porEncima.res.status, 409)
  assert.equal(porEncima.datos.code, 'premium_cooldown_hours')

  // Banco lleno (24 h): el botón queda bloqueado hasta bajar de 10 h.
  guardarConfigSubBot(ROOT, PHONE, { premium: { expiresAt: Date.now() + 25 * 60 * 60 * 1000 } })
  const lleno = await pedir('/api/premium/ad/start', sesionDueno, 'POST', { phone: PHONE })
  assert.equal(lleno.res.status, 409)
  assert.equal(lleno.datos.code, 'premium_locked')

  // Si el dueño no es el de la sesión, no hay acceso.
  const intruso = await pedir(`/api/premium/${PHONE_OTRO}`, sesionDueno, 'PATCH', { moneda: 'USD' })
  assert.equal(intruso.res.status, 404)
})

test('premium: solo el administrador con permiso ajusta los anuncios', async () => {
  const rolSinPermiso = await handle.store.crearRol({
    key: 'soporte',
    name: 'Soporte',
    scope: 'admin',
    permissions: ['admin.access', 'admin.settings'],
  })
  const soporte = await handle.store.crearUsuario({
    username: 'soporte',
    email: 'soporte@example.com',
    passwordHash: await hashPassword('soportepass1'),
    roleId: rolSinPermiso.id,
  })
  assert.ok(soporte)
  const sesionSoporte = await entrar('soporte', 'soportepass1')

  const ajustesVista = await pedir('/api/admin/settings', sesionSoporte)
  assert.equal(ajustesVista.res.status, 200)
  assert.equal(ajustesVista.datos.canPremium, false)
  assert.equal(ajustesVista.datos.premium, null)

  const intento = await pedir('/api/admin/settings', sesionSoporte, 'PATCH', {
    premium: { adMinutes: 120 },
  })
  assert.equal(intento.res.status, 403)

  // El principal sí puede, y el cambio queda guardado.
  const guardado = await pedir('/api/admin/settings', sesionAdmin, 'PATCH', {
    premium: { adMinutes: 90, adSeconds: 5, maxHours: 24, unlockHours: 10, enabled: true },
  })
  assert.equal(guardado.res.status, 200)
  assert.equal(guardado.datos.premium.adMinutes, 90)
  const leido = await pedir('/api/admin/settings', sesionAdmin)
  assert.equal(leido.datos.premium.adMinutes, 90)
})

test('premium: el dashboard cuenta los premium activos y los guardados sin plan', async () => {
  // Activo: plan vigente. Guardado: plan caducado pero con personalización
  // conservada (vuelve sola cuando el dueño suma tiempo).
  guardarConfigSubBot(ROOT, PHONE, {
    premium: { expiresAt: Date.now() + 60 * 60 * 1000 },
    premiumEdits: { moneda: 'PEN', menu: { creador: 'Creador' }, canal: { jid: '', nombre: '' } },
  })
  guardarConfigSubBot(ROOT, PHONE_OTRO, {
    premium: { expiresAt: Date.now() - 1000 },
    premiumEdits: { moneda: 'USD', menu: { creador: 'Otro' }, canal: { jid: '', nombre: '' } },
  })

  // El sondeo público está cacheado 5 s: se fuerza una lectura nueva.
  await delay(5200)
  const stats = await pedir('/api/stats')
  assert.equal(stats.res.status, 200)
  assert.equal(stats.datos.premiumActive, 1)
  assert.equal(stats.datos.premiumSaved, 1)

  // Un bot sin personalización y sin plan no suma en ninguna de las dos.
  guardarConfigSubBot(ROOT, '5215500000001', { premium: { expiresAt: 0 } })
  await delay(5200)
  const otra = await pedir('/api/stats')
  assert.equal(otra.datos.premiumActive, 1)
  assert.equal(otra.datos.premiumSaved, 1)
})

test('premium: el iframe del anuncio se sirve aislado y solo si está configurado', async () => {
  await guardarAjustesPremium(handle.store, {
    banners: { small: 'https://www.highperformanceformat.com/31905924/invoke.js', medium: '', native: '' },
  })
  const marco = await fetch(`${BASE}/api/premium/frame?b=small`, { headers: sesionDueno })
  assert.equal(marco.status, 200)
  assert.equal(marco.headers.get('x-frame-options'), 'SAMEORIGIN')
  assert.match(marco.headers.get('content-security-policy'), /frame-ancestors 'self'/)
  const html = await marco.text()
  assert.ok(html.includes('highperformanceformat.com/31905924/invoke.js'))
  assert.ok(html.includes('container-31905924'), 'usa el contenedor que espera Adsterra')

  const vacio = await fetch(`${BASE}/api/premium/frame?b=medium`, { headers: sesionDueno })
  assert.equal(vacio.status, 404)
  // El frame es público: los iframes con sandbox no mandan la cookie de sesión
  // y no expone datos de ningún usuario, solo el anuncio configurado.
  const sinSesion = await fetch(`${BASE}/api/premium/frame?b=small`)
  assert.equal(sinSesion.status, 200)
  assert.ok(!(await sinSesion.text()).includes('pain_panel'))
  const desconocido = await fetch(`${BASE}/api/premium/frame?b=huge`, { headers: sesionDueno })
  assert.equal(desconocido.status, 400)
})
