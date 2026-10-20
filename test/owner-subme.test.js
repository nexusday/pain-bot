import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../plugins/owner-subme.js'

function socketSub(numero) {
  const enviados = []
  return {
    enviados,
    phoneNumber: numero,
    user: { jid: `${numero}@s.whatsapp.net` },
    ws: { isOpen: true },
    sendMessage: async (jid, payload) => {
      enviados.push({ jid, text: payload?.text })
      return { key: { id: 'ok' } }
    },
  }
}

function Principal() {
  const enviados = []
  return {
    enviados,
    user: { jid: '5210000000000@s.whatsapp.net' },
    sendMessage: async (jid, payload) => {
      enviados.push({ jid, text: payload?.text })
      return { key: { id: 'ok' } }
    },
  }
}

test('el bot principal no le escribe a nadie: cada sub-bot se escribe a sí mismo', async () => {
  const principal = Principal()
  const subA = socketSub('5211111111111')
  const subB = socketSub('5212222222222')

  global.conn = principal
  global.conns = [subA, subB]

  const m = {
    chat: '5219999999999@s.whatsapp.net',
    sender: '5219999999999@s.whatsapp.net',
    reply: async () => {},
  }

  await handler(m, {
    conn: principal,
    usedPrefix: '/',
    command: 'subme',
    args: ['holaaa'],
    text: 'holaaa',
    isOwner: true,
  })

  // El principal no mandó NI la confirmación ni nada a los sub-bots.
  assert.equal(principal.enviados.length, 0)

  // Cada sub-bot se escribió a sí mismo.
  assert.equal(subA.enviados.length, 1)
  assert.equal(subA.enviados[0].jid, '5211111111111@s.whatsapp.net')
  assert.equal(subA.enviados[0].text, 'holaaa')
  assert.equal(subB.enviados.length, 1)
  assert.equal(subB.enviados[0].jid, '5212222222222@s.whatsapp.net')
  assert.equal(subB.enviados[0].text, 'holaaa')

  // Ningún sub-bot recibió el mensaje de otro.
  assert.ok(!subA.enviados.some((e) => e.jid === '5212222222222@s.whatsapp.net'))
  assert.ok(!subA.enviados.some((e) => e.jid === '5210000000000@s.whatsapp.net'))
})

test('sin mensaje el bot principal solo avisa del error de uso', async () => {
  const principal = Principal()
  const replied = []
  global.conn = principal
  global.conns = []

  const m = {
    chat: '5219999999999@s.whatsapp.net',
    reply: async (texto) => { replied.push(texto) },
  }

  await handler(m, {
    conn: principal,
    usedPrefix: '/',
    command: 'subme',
    args: [],
    text: '',
    isOwner: true,
  })

  assert.equal(replied.length, 1)
  assert.match(replied[0], /mensaje/i)
  assert.equal(principal.enviados.length, 0)
})
