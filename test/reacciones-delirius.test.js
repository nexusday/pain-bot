import test from 'node:test'
import assert from 'node:assert/strict'
import {
  urlReaccionDelirius,
  videoReaccionDelirius,
  obtenerReaccionDelirius,
  crearReaccionesDelirius,
  TIPOS_REACCION_DELIRIUS,
} from '../lib/reacciones-delirius.js'
import kiss from '../plugins/reaccion-beso.js'
import kill from '../plugins/reaccion-kill.js'
import pat from '../plugins/reaccion-pat.js'
import reacciones from '../plugins/reaccion-delirius.js'
import hug from '../plugins/reaccion-abrazo.js'
import slap from '../plugins/reaccion-slap.js'
import sad from '../plugins/reaccion-sad.js'
import reir from '../plugins/reaccion-reir.js'
import happy from '../plugins/reaccion-happy.js'
import enojado from '../plugins/reaccion-enojado.js'
import dance from '../plugins/reaccion-dance.js'

const A = '5211111111111@s.whatsapp.net'
const B = '5222222222222@s.whatsapp.net'
const C = '5233333333333@s.whatsapp.net'
const api = { url: 'https://api.example.com/base///', key: null }
const respuesta = tipo => ({ creator: 'Delirius', status: true, data: { name: 'clip.mp4', url: `http://cdn.delirius.online/v2/reaction/sfw/${tipo}/clip.mp4` } })

test('Delirius: construye las rutas desde configuración, conserva su base y usa una clave opcional', () => {
  for (const tipo of TIPOS_REACCION_DELIRIUS) {
    assert.equal(urlReaccionDelirius(tipo, api), `https://api.example.com/base/reactions/${tipo}`)
  }
  assert.ok(TIPOS_REACCION_DELIRIUS.includes('cuddle'))
  assert.ok(!TIPOS_REACCION_DELIRIUS.includes('glomp'))
  assert.throws(() => urlReaccionDelirius('glomp', api))
  assert.equal(new URL(urlReaccionDelirius('kiss', { ...api, key: 'clave con símbolos&' })).searchParams.get('apikey'), 'clave con símbolos&')
  assert.throws(() => urlReaccionDelirius('kiss', {}))
  assert.throws(() => urlReaccionDelirius('../admin', api))
  assert.throws(() => urlReaccionDelirius('kiss', { url: 'file:///tmp/api' }))
})

test('Delirius: extrae data.url y utiliza HTTPS para el CDN', () => {
  assert.equal(videoReaccionDelirius(respuesta('kiss')), 'https://cdn.delirius.online/v2/reaction/sfw/kiss/clip.mp4')
  for (const cuerpo of [
    { ...respuesta('kiss'), status: false }, {}, { status: true, data: {} },
    { status: true, data: { url: 'javascript:alert(1)' } },
    { status: true, data: { url: 'file:///video.mp4' } },
    { status: true, data: { url: 'https://cdn.delirius.online/error.html' } },
  ]) assert.throws(() => videoReaccionDelirius(cuerpo))
})

test('Delirius: consulta JSON con límite de espera y rechaza fallos HTTP', async () => {
  const url = await obtenerReaccionDelirius('pat', { api, fetchFn: async (ruta, opciones) => {
    assert.equal(ruta, 'https://api.example.com/base/reactions/pat')
    assert.equal(opciones.headers.Accept, 'application/json')
    assert.equal(opciones.signal.aborted, false)
    return { ok: true, json: async () => respuesta('pat') }
  } })
  assert.match(url, /pat\/clip\.mp4$/)
  await assert.rejects(obtenerReaccionDelirius('pat', { api, fetchFn: async () => ({ ok: false, status: 503 }) }), /503/)
})

async function ejecutar(handler, tipo, m, { fallar = false, command = tipo } = {}) {
  const prev = { APIs: global.APIs, fetch: global.fetch, error: console.error }
  const enviados = []
  const peticiones = []
  const errores = []
  const conn = { decodeJid: j => j, sendMessage: async (chat, content, options) => { enviados.push({ chat, content, options }) } }
  try {
    global.APIs = { delirius: { url: api.url, key: 'clave-privada' } }
    global.fetch = async (url, opts) => {
      peticiones.push({ url, opts })
      if (fallar) throw new Error(`Red: ${url}`)
      return { ok: true, json: async () => respuesta(tipo) }
    }
    console.error = (...args) => errores.push(args.join(' '))
    await handler(m, { conn, usedPrefix: '/', command, participants: [] })
    return { enviados, peticiones, errores }
  } finally {
    global.APIs = prev.APIs
    global.fetch = prev.fetch
    console.error = prev.error
  }
}

for (const [tipo, handler, alias] of [['kiss', kiss, 'beso'], ['kill', kill, 'matar'], ['pat', pat, 'acariciar']]) {
  test(`${tipo}: el handler real usa Delirius global y responde al autor citado`, async () => {
    const m = { sender: A, chat: 'prueba@g.us', isGroup: true, quoted: { sender: B, mentionedJid: [C] } }
    const { enviados, peticiones } = await ejecutar(handler, tipo, m)
    assert.equal(peticiones.length, 1)
    assert.equal(new URL(peticiones[0].url).pathname, `/base/reactions/${tipo}`)
    assert.equal(enviados.length, 1)
    assert.equal(enviados[0].content.video.url, `https://cdn.delirius.online/v2/reaction/sfw/${tipo}/clip.mp4`)
    assert.equal(enviados[0].content.mimetype, 'video/mp4')
    assert.equal(enviados[0].content.gifPlayback, true)
    assert.deepEqual(enviados[0].content.contextInfo.mentionedJid, [A, B])
    assert.equal(enviados[0].options.quoted, m)
    assert.ok(handler.command.includes(alias))
  })

  test(`${tipo}: conserva menciones y explica el uso sin consultar la API si falta destinatario`, async () => {
    const m = { sender: A, chat: B, isGroup: false, mentionedJid: [C], quoted: { sender: B } }
    const conMencion = await ejecutar(handler, tipo, m)
    assert.deepEqual(conMencion.enviados[0].content.contextInfo.mentionedJid, [A, C])
    const sinObjetivo = await ejecutar(handler, tipo, { sender: A, chat: B })
    assert.equal(sinObjetivo.peticiones.length, 0)
    assert.match(sinObjetivo.enviados[0].content.text, /responde/)
  })

  test(`${tipo}: informa un error de API sin filtrar la clave ni enviar un vídeo inválido`, async () => {
    const { enviados, errores } = await ejecutar(handler, tipo, { sender: A, chat: B, quoted: { sender: B } }, { fallar: true })
    assert.equal(enviados.length, 1)
    assert.equal(enviados[0].content.video, undefined)
    assert.match(enviados[0].content.text, /No se pudo cargar/)
    assert.ok(!JSON.stringify({ enviados, errores }).includes('clave-privada'))
  })
}

const TIPOS_POR_COMANDO = {
  bite: 'bite', morder: 'bite',
  blush: 'blush', sonrojo: 'blush', sonrojarse: 'blush',
  bonk: 'bonk', coscorron: 'bonk',
  bully: 'bully', molestar: 'bully',
  confy: 'confy', consolar: 'confy',
  cringe: 'cringe',
  cuddle: 'cuddle', acurrucar: 'cuddle',
  eevee: 'eevee',
  fluff: 'fluff', esponjar: 'fluff',
  handhold: 'handhold', mano: 'handhold',
  highfive: 'highfive', choca: 'highfive', chocar: 'highfive',
  lay: 'lay', recostar: 'lay',
  lick: 'lick', lamer: 'lick',
  nom: 'nom', nam: 'nom',
  poke: 'poke', picar: 'poke',
  pout: 'pout', berrinche: 'pout',
  smile: 'smile', sonreir: 'smile',
  smug: 'smug', presumir: 'smug',
  tail: 'tail', cola: 'tail',
  tickle: 'tickle', cosquillas: 'tickle',
  wink: 'wink', guino: 'wink', 'guiño': 'wink',
  yeet: 'yeet', lanzar: 'yeet',
  patada: 'kick',
  cry: 'cry', llorar: 'cry',
}

test('reacciones existentes: todas usan Delirius sin conservar FFmpeg ni Tenor', () => {
  const esperadas = [
    [kiss, 'kiss', false],
    [hug, 'hug', false],
    [slap, 'slap', false],
    [sad, 'cry', true],
    [reir, 'smile', true],
    [happy, 'happy', true],
    [enojado, 'angry', true],
    [dance, 'dance', true],
    [kill, 'kill', false],
    [pat, 'pat', false],
  ]
  for (const [handler, tipo, opcional] of esperadas) {
    assert.equal(handler.tipoReaccion, tipo)
    assert.equal(handler.opcional, opcional)
    assert.equal(handler.tags[0], 'reaccion')
  }
})

test('catálogo: registra cada alias una sola vez y no ocupa comandos de moderación', () => {
  assert.equal(new Set(reacciones.command).size, reacciones.command.length)
  assert.deepEqual([...reacciones.command].sort(), Object.keys(TIPOS_POR_COMANDO).sort())
  assert.ok(!reacciones.command.includes('kick'))
  assert.ok(reacciones.command.includes('patada'))
  assert.equal(reacciones.tags[0], 'reaccion')
})

test('catálogo: cada comando consulta su tipo correcto y menciona al autor citado', async () => {
  const m = { sender: A, chat: 'prueba@g.us', isGroup: true, quoted: { sender: B } }
  for (const [command, tipo] of Object.entries(TIPOS_POR_COMANDO)) {
    const { enviados, peticiones } = await ejecutar(reacciones, tipo, m, { command })
    assert.equal(peticiones.length, 1, `${command} no consultó la API`)
    assert.equal(new URL(peticiones[0].url).pathname, `/base/reactions/${tipo}`, command)
    assert.equal(enviados.length, 1, command)
    assert.equal(enviados[0].content.video.url, `https://cdn.delirius.online/v2/reaction/sfw/${tipo}/clip.mp4`, command)
    assert.equal(enviados[0].content.mimetype, 'video/mp4', command)
    assert.equal(enviados[0].content.gifPlayback, true, command)
    assert.match(enviados[0].content.caption, /@5222222222222/, command)
    assert.deepEqual(enviados[0].content.contextInfo.mentionedJid, [A, B], command)
    assert.equal(enviados[0].options.quoted, m, command)
  }
})

test('catálogo: las acciones individuales funcionan sin objetivo y las sociales lo exigen', async () => {
  const individual = await ejecutar(reacciones, 'blush', { sender: A, chat: B })
  assert.equal(individual.peticiones.length, 1)
  assert.match(individual.enviados[0].content.caption, /se sonrojó/)
  assert.deepEqual(individual.enviados[0].content.contextInfo.mentionedJid, [A])

  const social = await ejecutar(reacciones, 'bite', { sender: A, chat: B })
  assert.equal(social.peticiones.length, 0)
  assert.match(social.enviados[0].content.text, /responde/)
  assert.ok(social.enviados[0].content.text.includes('/bite'))
})

test('catálogo: un alias usa el tipo canónico aunque el comando tenga otro nombre', async () => {
  const { enviados, peticiones } = await ejecutar(reacciones, 'kick', { sender: A, chat: B, quoted: { sender: B } }, { command: 'patada' })
  assert.equal(new URL(peticiones[0].url).pathname, '/base/reactions/kick')
  assert.match(enviados[0].content.caption, /patada/)
})

test('catálogo: rechaza definiciones inválidas o comandos duplicados antes de registrar', () => {
  assert.throws(() => crearReaccionesDelirius([]), /No hay reacciones/)
  assert.throws(() => crearReaccionesDelirius([{ tipo: 'nope', comandos: ['nope'], texto() {} }]), /no válida/)
  assert.throws(() => crearReaccionesDelirius([{ tipo: 'bite', comandos: [], texto() {} }]), /no tiene comandos/)
  assert.throws(() => crearReaccionesDelirius([{ tipo: 'bite', comandos: ['x'], texto: 'x' }]), /no tiene texto/)
  assert.throws(() => crearReaccionesDelirius([
    { tipo: 'bite', comandos: ['repetido'], texto() {} },
    { tipo: 'poke', comandos: ['repetido'], texto() {} },
  ]), /duplicado/)
})

test('catálogo: informa el fallo de Delirius sin filtrar la clave', async () => {
  const { enviados, errores } = await ejecutar(reacciones, 'bite', { sender: A, chat: B, quoted: { sender: B } }, { fallar: true })
  assert.equal(enviados.length, 1)
  assert.equal(enviados[0].content.video, undefined)
  assert.match(enviados[0].content.text, /No se pudo cargar/)
  assert.ok(!JSON.stringify({ enviados, errores }).includes('clave-privada'))
})
