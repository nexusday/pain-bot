import test from 'node:test'
import assert from 'node:assert/strict'
import {
  recordarMensajeCache,
  podarChatsSocket,
  podarMetadataChats,
  estadisticasSockets,
} from '../lib/socket-message-cache.js'

function crearChat(id, { edadMs = 0, participantes = 5 } = {}) {
  return {
    id,
    _metaEn: Date.now() - edadMs,
    metadata: {
      participants: Array.from({ length: participantes }, (_, indice) => ({
        id: `${indice}@s.whatsapp.net`,
      })),
    },
    messages: {},
  }
}

test('aligera las miniaturas de los mensajes cacheados', () => {
  const chat = crearChat('120363000000000001@g.us')
  const mensaje = {
    key: { id: 'm1' },
    messageTimestamp: Math.floor(Date.now() / 1000),
    message: {
      imageMessage: {
        jpegThumbnail: Buffer.alloc(1024),
        url: 'https://example.test/imagen',
      },
    },
  }
  chat.messages.m1 = mensaje

  recordarMensajeCache(chat, 'm1', mensaje)

  assert.equal('jpegThumbnail' in mensaje.message.imageMessage, false)
  assert.equal(mensaje.message.imageMessage.url, 'https://example.test/imagen')
})

test('poda los chats menos activos y conserva los recientes', () => {
  const chats = {}
  for (let indice = 0; indice < 20; indice++) {
    const id = `1203630000000000${String(indice).padStart(2, '0')}@g.us`
    chats[id] = crearChat(id, { edadMs: indice * 60_000 })
  }

  const borrados = podarChatsSocket({ chats }, 12)

  assert.equal(borrados, 8)
  assert.equal(Object.keys(chats).length, 12)
  assert.ok(chats['120363000000000000@g.us'])
  assert.equal(chats['120363000000000019@g.us'], undefined)
})

test('suelta metadata de grupos inactivos sin borrar el chat', () => {
  const chats = {}
  for (let indice = 0; indice < 10; indice++) {
    const id = `1203630000000000${String(indice).padStart(2, '0')}@g.us`
    chats[id] = crearChat(id, { edadMs: indice * 10 * 60_000 })
  }

  const borrados = podarMetadataChats({ chats }, { max: 3, maxAgeMs: 30 * 60_000 })

  assert.ok(borrados >= 7)
  assert.equal(Object.keys(chats).length, 10)
  assert.ok(chats['120363000000000000@g.us'].metadata)
  assert.equal(chats['120363000000000009@g.us'].metadata, undefined)
})

test('no cuenta metadata de chats que no son grupos', () => {
  const chats = {
    '120363000000000001@g.us': crearChat('120363000000000001@g.us'),
    '5215550000000@s.whatsapp.net': crearChat('5215550000000@s.whatsapp.net'),
  }

  podarMetadataChats({ chats }, { max: 10, maxAgeMs: 60_000 })

  assert.ok(chats['120363000000000001@g.us'].metadata)
  assert.equal(chats['5215550000000@s.whatsapp.net'].metadata, undefined)
})

test('resume chats, mensajes y metadata sin serializar', () => {
  const chat = crearChat('120363000000000001@g.us', { participantes: 7 })
  const mensaje = { key: { id: 'm1' }, messageTimestamp: 1, message: { conversation: 'hola' } }
  chat.messages.m1 = mensaje
  recordarMensajeCache(chat, 'm1', mensaje)

  const resumen = estadisticasSockets([{ chats: { [chat.id]: chat } }])

  assert.deepEqual(resumen, {
    sockets: 1,
    chats: 1,
    mensajes: 1,
    metadata: 1,
    participantes: 7,
  })
})
