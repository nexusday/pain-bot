import test from 'node:test'
import assert from 'node:assert/strict'
import {
  enviarPrivadoDesdeSockets,
  numeroDeSubBot,
  resolverDestinoPrivado,
  resumirFallidos,
} from '../lib/subme-broadcast.js'

function socketFalso(numero, { falla = false, lid = null } = {}) {
  const enviados = []
  return {
    enviados,
    phoneNumber: numero,
    user: { jid: `${numero}@s.whatsapp.net` },
    signalRepository: lid
      ? { lidMapping: { getPNForLID: async () => lid } }
      : undefined,
    sendMessage: async (jid, payload) => {
      if (falla) throw new Error('no se pudo enviar')
      enviados.push({ jid, text: payload?.text })
      return { key: { id: 'x' } }
    },
  }
}

test('cada sub-bot escribe al owner en su propio privado', async () => {
  const a = socketFalso('5211111111111')
  const b = socketFalso('5212222222222')

  const resultado = await enviarPrivadoDesdeSockets(
    '5219999999999@s.whatsapp.net',
    'hola owner',
    [a, b],
  )

  assert.equal(resultado.enviados, 2)
  assert.deepEqual(resultado.fallidos, [])
  assert.equal(a.enviados.length, 1)
  assert.equal(b.enviados.length, 1)
  // Cada sub-bot envía SU mensaje, no el principal a cada sub-bot.
  assert.equal(a.enviados[0].jid, '5219999999999@s.whatsapp.net')
  assert.equal(a.enviados[0].text, 'hola owner')
  assert.equal(b.enviados[0].jid, '5219999999999@s.whatsapp.net')
})

test('un sub-bot que falla se reporta sin tumbar a los demás', async () => {
  const ok = socketFalso('5211111111111')
  const malo = socketFalso('5212222222222', { falla: true })

  const resultado = await enviarPrivadoDesdeSockets(
    '5219999999999@s.whatsapp.net',
    'hola',
    [ok, malo],
  )

  assert.equal(resultado.enviados, 1)
  assert.deepEqual(resultado.fallidos, ['5212222222222'])
  assert.equal(resultado.total, 2)
})

test('resuelve el destino LID con el mapeo del propio socket', async () => {
  const socket = socketFalso('5211111111111', { lid: '5219999999999@s.whatsapp.net' })
  const destino = await resolverDestinoPrivado(socket, '999999999999@lid')
  assert.equal(destino, '5219999999999@s.whatsapp.net')
})

test('si no puede resolver el LID, lo deja tal cual para que lo intente el worker', async () => {
  const destino = await resolverDestinoPrivado(socketFalso('5211111111111'), '999999999999@lid')
  assert.equal(destino, '999999999999@lid')
})

test('saca el número público del sub-bot', () => {
  assert.equal(numeroDeSubBot({ phoneNumber: '5211111111111' }), '5211111111111')
  assert.equal(numeroDeSubBot({ user: { jid: '5212222222222@s.whatsapp.net' } }), '5212222222222')
  assert.equal(numeroDeSubBot({ pathAYBot: 'C:/bot/Serbot/5213333333333' }), '5213333333333')
  assert.equal(numeroDeSubBot({}), '')
})

test('resume la lista de fallidos sin endlessar el mensaje', () => {
  assert.equal(resumirFallidos(['5211111111111']), '+5211111111111')
  const muchos = Array.from({ length: 30 }, (_, i) => `5210000000${String(i).padStart(3, '0')}`)
  const resumen = resumirFallidos(muchos)
  assert.ok(resumen.includes('(+5 más)'))
})
