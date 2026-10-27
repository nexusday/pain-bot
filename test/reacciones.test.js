import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { datosReaccion } from '../lib/reacciones.js'
import { crearReaccionDelirius } from '../lib/reacciones-delirius.js'

const A = '5211111111111@s.whatsapp.net'
const B = '5222222222222@s.whatsapp.net'
const C = '5233333333333@s.whatsapp.net'
const LID = '777777777777@lid'
const conn = { decodeJid: j => j }
const mensaje = (extra = {}) => ({ sender: A, chat: 'grupo@g.us', isGroup: true, mentionedJid: [], ...extra })

test('reacciones: responde al autor y no a las personas mencionadas dentro de la cita', () => {
  const r = datosReaccion(mensaje({ quoted: { sender: B, mentionedJid: [C] } }), conn)
  assert.equal(r.objetivo, B)
  assert.deepEqual(r.mencion, [A, B])
})

test('reacciones: una mención explícita prevalece sobre responder a otra persona', () => {
  assert.equal(datosReaccion(mensaje({ mentionedJid: [C], quoted: { sender: B } }), conn).objetivo, C)
})

test('reacciones: recupera al autor desde contextInfo cuando no hay quoted serializado', () => {
  const r = datosReaccion(mensaje({ msg: { contextInfo: { stanzaId: 'cita', participant: B, quotedMessage: { conversation: 'Hola' } } } }), conn)
  assert.equal(r.objetivo, B)
  assert.equal(datosReaccion(mensaje({ msg: { contextInfo: { participant: B } } }), conn).objetivo, null)
})

test('reacciones: admite respuestas por privado y citas con key.participant', () => {
  assert.equal(datosReaccion(mensaje({ isGroup: false, chat: B, quoted: { sender: B } }), conn).objetivo, B)
  assert.equal(datosReaccion(mensaje({ quoted: { key: { participant: B } } }), conn).objetivo, B)
})

test('reacciones: resuelve LID desde metadata sin consultas de red y conserva LID si falta mapeo', () => {
  const m = mensaje({ quoted: { sender: LID } })
  assert.equal(datosReaccion(m, conn, [{ id: LID, phoneNumber: B }]).objetivo, B)
  assert.equal(datosReaccion(m, conn).objetivo, LID)
})

test('reacciones: normaliza dispositivos y no trata grupos o canales como usuarios', () => {
  assert.equal(datosReaccion(mensaje({ quoted: { sender: '5222222222222:7@s.whatsapp.net' } }), conn).objetivo, B)
  for (const sender of ['grupo@g.us', '12345@newsletter', 'status@broadcast', 'sin-jid', { id: B }]) {
    assert.equal(datosReaccion(mensaje({ quoted: { sender } }), conn).objetivo, null)
  }
  assert.deepEqual(datosReaccion(mensaje({ quoted: { sender: A } }), conn).mencion, [A])
})

const plugins = [
  ['reaccion-beso.js', 'kiss', true, /beso/],
  ['reaccion-abrazo.js', 'hug', true, /abrazo/],
  ['reaccion-slap.js', 'slap', true, /bofetada/],
  ['reaccion-sad.js', 'sad', false, /triste/],
  ['reaccion-reir.js', 'reir', false, /riendo/],
  ['reaccion-happy.js', 'happy', false, /feliz/],
  ['reaccion-enojado.js', 'angry', false, /enojando/],
  ['reaccion-dance.js', 'dance', false, /bailando/],
]

// Ejecuta los handlers reales con transporte y conversión simulados. No
// descarga GIFs ni crea archivos temporales durante los tests.
function cargarPlugin(archivo, { fallaConversion = false } = {}) {
  const source = fs.readFileSync(new URL(`../plugins/${archivo}`, import.meta.url), 'utf8')
    .replace(/^import[^\n]*\n/gm, '')
    .replace('export default handler', 'globalThis.handler = handler')
  const contexto = vm.createContext({
    datosReaccion, Buffer,
    crearReaccionDelirius: opciones => crearReaccionDelirius(opciones, { obtenerVideo: async tipo => `https://cdn.delirius.online/v2/reaction/sfw/${tipo}/prueba.mp4` }),
    console: { error() {} },
    fetch: async () => {
      if (fallaConversion) return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }
      throw new Error('Descarga simulada: usar fallback')
    },
    tmpdir: () => '.', join: path.join,
    writeFileSync() {}, unlinkSync() {}, existsSync: () => false,
    spawn: () => {
      const hijo = new EventEmitter()
      hijo.stderr = new EventEmitter()
      queueMicrotask(() => hijo.emit('error', new Error('ffmpeg no disponible')))
      return hijo
    },
  })
  contexto.global = contexto
  contexto.rcanal = { contextInfo: {} }
  vm.runInContext(source, contexto, { filename: archivo })
  return contexto.handler
}

async function ejecutar(archivo, command, m, opciones = {}) {
  const enviados = []
  const conexion = { ...conn, sendMessage: async (chat, content, opts) => { enviados.push({ chat, content, opts }) } }
  const handler = cargarPlugin(archivo, opciones)
  await handler(m, { conn: conexion, command, usedPrefix: '!', participants: [] })
  return { enviados, handler }
}

for (const [archivo, command, obligatorio, texto] of plugins) {
  test(`${command}: funciona respondiendo y menciona al autor correcto`, async () => {
    const m = mensaje({ quoted: { sender: B, mentionedJid: [C] } })
    const { enviados } = await ejecutar(archivo, command, m)
    assert.equal(enviados.length, 1)
    assert.match(enviados[0].content.caption, texto)
    assert.match(enviados[0].content.caption, /@5222222222222/)
    assert.deepEqual(Array.from(enviados[0].content.contextInfo.mentionedJid), [A, B])
    assert.equal(enviados[0].opts.quoted, m)
    assert.equal(enviados[0].content.gifPlayback, true)
  })

  test(`${command}: conserva las menciones explícitas`, async () => {
    const { enviados } = await ejecutar(archivo, command, mensaje({ mentionedJid: [C], quoted: { sender: B } }))
    assert.deepEqual(Array.from(enviados[0].content.contextInfo.mentionedJid), [A, C])
    assert.match(enviados[0].content.caption, /@5233333333333/)
  })

  test(`${command}: ${obligatorio ? 'explica cómo mencionar o responder si falta objetivo' : 'conserva el uso individual sin objetivo'}`, async () => {
    const { enviados } = await ejecutar(archivo, command, mensaje())
    assert.equal(enviados.length, 1)
    if (obligatorio) {
      assert.match(enviados[0].content.text, /responde/)
      assert.ok(enviados[0].content.text.includes(`!${command}`))
    } else {
      assert.match(enviados[0].content.caption, texto)
      assert.deepEqual(Array.from(enviados[0].content.contextInfo.mentionedJid), [A])
    }
  })
}

test('kiss: envía el MP4 de Delirius conservando al destinatario de la respuesta', async () => {
  const { enviados } = await ejecutar('reaccion-beso.js', 'kiss', mensaje({ quoted: { sender: B } }))
  assert.equal(enviados.length, 1)
  assert.match(enviados[0].content.video.url, /delirius\.online\/.*kiss\/prueba\.mp4$/)
  assert.equal(enviados[0].content.mimetype, 'video/mp4')
  assert.deepEqual(Array.from(enviados[0].content.contextInfo.mentionedJid), [A, B])
})
