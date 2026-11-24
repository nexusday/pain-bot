import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cancelarSesionStickerAudio,
  crearSesionStickerAudio,
  haySesionStickerAudio,
  mimeAudioDe,
  tomarSesionStickerAudio
} from '../lib/sticker-audio.js'

const buffer = Buffer.from('imagen-de-prueba')

test('guarda la imagen y la entrega una sola vez', () => {
  const chat = '120363000000000001@g.us'
  const sender = '5215500000001@s.whatsapp.net'
  assert.equal(haySesionStickerAudio(chat), false)

  assert.equal(crearSesionStickerAudio({ chat, sender, buffer, tipo: 'image', modo: 'video' }), true)
  assert.equal(haySesionStickerAudio(chat), true)
  assert.equal(haySesionStickerAudio(chat, sender), true)

  const sesion = tomarSesionStickerAudio(chat, sender)
  assert.equal(sesion.buffer.toString(), 'imagen-de-prueba')
  assert.equal(sesion.tipo, 'image')
  assert.equal(sesion.modo, 'video')
  assert.equal(haySesionStickerAudio(chat), false)
  assert.equal(tomarSesionStickerAudio(chat, sender), null)
})

test('mantiene el chat activo mientras quede otra sesión', () => {
  const chat = '120363000000000002@g.us'
  const uno = '5215500000002@s.whatsapp.net'
  const dos = '5215500000003@s.whatsapp.net'
  crearSesionStickerAudio({ chat, sender: uno, buffer, tipo: 'sticker', modo: 'sticker' })
  crearSesionStickerAudio({ chat, sender: dos, buffer, tipo: 'image', modo: 'video' })

  assert.equal(tomarSesionStickerAudio(chat, uno).tipo, 'sticker')
  assert.equal(haySesionStickerAudio(chat), true)
  assert.equal(tomarSesionStickerAudio(chat, dos).tipo, 'image')
  assert.equal(haySesionStickerAudio(chat), false)
})

test('cancela y rechaza imágenes demasiado grandes', () => {
  const chat = '120363000000000003@g.us'
  const sender = '5215500000004@s.whatsapp.net'
  crearSesionStickerAudio({ chat, sender, buffer, tipo: 'image', modo: 'video' })
  assert.equal(cancelarSesionStickerAudio(chat, sender), true)
  assert.equal(cancelarSesionStickerAudio(chat, sender), false)
  assert.equal(haySesionStickerAudio(chat), false)

  const enorme = Buffer.alloc(6 * 1024 * 1024 + 1)
  assert.equal(crearSesionStickerAudio({ chat, sender, buffer: enorme, tipo: 'image' }), false)
})

test('detecta el MIME del audio por su cabecera', () => {
  assert.equal(mimeAudioDe(Buffer.from('OggSxxxx')), 'audio/ogg; codecs=opus')
  assert.equal(mimeAudioDe(Buffer.from('ID3xxxxx')), 'audio/mpeg')
  assert.equal(mimeAudioDe(Buffer.from('RIFFxxxx')), 'audio/wav')
  assert.equal(mimeAudioDe(Buffer.from([0, 0, 0, 32, 0x66, 0x74, 0x79, 0x70])), 'audio/mp4')
  assert.equal(mimeAudioDe(Buffer.alloc(0)), 'audio/mpeg')
})
