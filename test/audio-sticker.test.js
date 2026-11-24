import test from 'node:test'
import assert from 'node:assert/strict'
import { proto } from '@whiskeysockets/baileys'
import {
  construirContenidoAudioSticker,
  parchearProtoAudioSticker
} from '../lib/audio-sticker.js'

const TAG_AUDIO_STICKER = Buffer.from([0xb2, 0x08]) // campo 134, length-delimited
const TAG_AUDIO_DENTRO_STICKER = Buffer.from([0xd2, 0x01]) // campo 26, length-delimited

test('el contenido nativo anida el audio dentro del sticker', () => {
  const contenido = construirContenidoAudioSticker(
    { url: 'https://ejemplo/sticker.enc', mimetype: 'image/webp', isAnimated: true },
    { url: 'https://ejemplo/audio.enc', mimetype: 'audio/ogg; codecs=opus', ptt: true }
  )

  const sticker = contenido.audioStickerMessage.message.stickerMessage
  assert.equal(sticker.url, 'https://ejemplo/sticker.enc')
  assert.equal(sticker.isAnimated, true)
  assert.equal(sticker.width, 512)
  assert.equal(sticker.height, 512)
  assert.equal(sticker.audioMessage.url, 'https://ejemplo/audio.enc')
  assert.equal(sticker.audioMessage.ptt, true)
})

test('rechaza contenido incompleto', () => {
  assert.throws(() => construirContenidoAudioSticker(null, {}))
  assert.throws(() => construirContenidoAudioSticker({}, null))
})

test('el codificador emite los campos 134 y 26 del protocolo', () => {
  parchearProtoAudioSticker()
  const contenido = construirContenidoAudioSticker(
    { url: 'https://ejemplo/sticker.enc', mimetype: 'image/webp' },
    { url: 'https://ejemplo/audio.enc', mimetype: 'audio/ogg; codecs=opus', ptt: true }
  )

  const bytes = proto.Message.encode(contenido).finish()
  assert.ok(bytes.includes(TAG_AUDIO_STICKER), 'falta audioStickerMessage (134)')
  assert.ok(bytes.includes(TAG_AUDIO_DENTRO_STICKER), 'falta StickerMessage.audioMessage (26)')
})

test('el parche es idempotente y no duplica los campos', () => {
  parchearProtoAudioSticker()
  parchearProtoAudioSticker()
  const contenido = construirContenidoAudioSticker(
    { url: 'https://ejemplo/sticker.enc', mimetype: 'image/webp' },
    { url: 'https://ejemplo/audio.enc', mimetype: 'audio/ogg; codecs=opus' }
  )
  const bytes = proto.Message.encode(contenido).finish()
  let apariciones = 0
  for (let i = 0; i < bytes.length - 1; i++) {
    if (bytes[i] === TAG_AUDIO_STICKER[0] && bytes[i + 1] === TAG_AUDIO_STICKER[1]) apariciones++
  }
  assert.equal(apariciones, 1)
})
