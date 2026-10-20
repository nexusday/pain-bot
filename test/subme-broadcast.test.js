import test from 'node:test'
import assert from 'node:assert/strict'
import {
  enviarMensajeASuPropioChat,
  jidPropioSubBot,
  numeroDeSubBot,
  resumirFallidos,
} from '../lib/subme-broadcast.js'

function socketFalso(numero, { falla = false } = {}) {
  const enviados = []
  return {
    enviados,
    phoneNumber: numero,
    user: { jid: `${numero}@s.whatsapp.net` },
    sendMessage: async (jid, payload) => {
      if (falla) throw new Error('no se pudo enviar')
      enviados.push({ jid, text: payload?.text })
      return { key: { id: 'x' } }
    },
  }
}

test('cada sub-bot se escribe a sí mismo', async () => {
  const a = socketFalso('5211111111111')
  const b = socketFalso('5212222222222')

  const resultado = await enviarMensajeASuPropioChat('hola owner', [a, b])

  assert.equal(resultado.enviados, 2)
  assert.deepEqual(resultado.fallidos, [])
  // El destino es el propio número de cada sub-bot, no el del owner.
  assert.equal(a.enviados[0].jid, '5211111111111@s.whatsapp.net')
  assert.equal(b.enviados[0].jid, '5212222222222@s.whatsapp.net')
  assert.equal(a.enviados[0].text, 'hola owner')
})

test('un sub-bot que falla se reporta sin tumbar a los demás', async () => {
  const ok = socketFalso('5211111111111')
  const malo = socketFalso('5212222222222', { falla: true })

  const resultado = await enviarMensajeASuPropioChat('hola', [ok, malo])

  assert.equal(resultado.enviados, 1)
  assert.deepEqual(resultado.fallidos, ['5212222222222'])
  assert.equal(resultado.total, 2)
})

test('el JID propio sale del número del sub-bot', () => {
  assert.equal(jidPropioSubBot({ phoneNumber: '5211111111111' }), '5211111111111@s.whatsapp.net')
  assert.equal(jidPropioSubBot({ user: { jid: '5212222222222@s.whatsapp.net' } }), '5212222222222@s.whatsapp.net')
  assert.equal(jidPropioSubBot({ pathAYBot: 'C:/bot/Serbot/5213333333333' }), '5213333333333@s.whatsapp.net')
  assert.equal(jidPropioSubBot({}), '')
})

test('saca el número público del sub-bot', () => {
  assert.equal(numeroDeSubBot({ phoneNumber: '5211111111111' }), '5211111111111')
  assert.equal(numeroDeSubBot({ user: { jid: '5212222222222@s.whatsapp.net' } }), '5212222222222')
  assert.equal(numeroDeSubBot({}), '')
})

test('resume la lista de fallidos sin endlessar el mensaje', () => {
  assert.equal(resumirFallidos(['5211111111111']), '+5211111111111')
  const muchos = Array.from({ length: 30 }, (_, i) => `5210000000${String(i).padStart(3, '0')}`)
  const resumen = resumirFallidos(muchos)
  assert.ok(resumen.includes('(+5 más)'))
})
