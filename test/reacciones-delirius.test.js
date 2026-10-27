import test from 'node:test'
import assert from 'node:assert/strict'
import { urlReaccionDelirius, videoReaccionDelirius, obtenerReaccionDelirius } from '../lib/reacciones-delirius.js'
import kiss from '../plugins/reaccion-beso.js'
import kill from '../plugins/reaccion-kill.js'
import pat from '../plugins/reaccion-pat.js'

const A = '5211111111111@s.whatsapp.net'
const B = '5222222222222@s.whatsapp.net'
const C = '5233333333333@s.whatsapp.net'
const api = { url: 'https://api.example.com/base///', key: null }
const respuesta = tipo => ({ creator: 'Delirius', status: true, data: { name: 'clip.mp4', url: `http://cdn.delirius.online/v2/reaction/sfw/${tipo}/clip.mp4` } })

test('Delirius: construye las rutas desde configuración, conserva su base y usa una clave opcional', () => {
  for (const tipo of ['kill', 'kiss', 'pat']) {
    assert.equal(urlReaccionDelirius(tipo, api), `https://api.example.com/base/reactions/${tipo}`)
  }
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

async function ejecutar(handler, tipo, m, { fallar = false } = {}) {
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
    await handler(m, { conn, usedPrefix: '/', command: tipo, participants: [] })
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
