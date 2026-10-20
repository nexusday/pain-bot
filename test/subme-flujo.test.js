import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { requestEnviarPrivadoSubBots } from '../lib/process-isolation.js'
import { crearCoordinadorSubme } from '../lib/subme-coordinator.js'
import { enviarMensajeASuPropioChat } from '../lib/subme-broadcast.js'

/**
 * Simula la cadena completa de /subme:
 * principal -> supervisor -> workers -> resultados -> ack al principal.
 */
function montar({ workers: definiciones }) {
  const primary = new EventEmitter()
  primary.env = { PAIN_ROLE: 'primary' }
  primary.send = (mensaje) => {
    supervisor.emit('from-primary', mensaje)
    return true
  }

  const workers = new Map()
  for (const [id, sockets] of Object.entries(definiciones)) {
    const worker = new EventEmitter()
    worker.connected = true
    worker.send = (mensaje) => {
      setTimeout(() => worker.emit('message', mensaje), 1)
      return true
    }
    worker.on('message', async (mensaje) => {
      if (mensaje?.type !== 'send-private') return
      const resultado = await enviarMensajeASuPropioChat(mensaje.text, sockets)
      supervisor.emit('from-worker', id, {
        type: 'send-private-result',
        requestId: mensaje.requestId,
        enviados: resultado.enviados,
        fallidos: resultado.fallidos,
      })
    })
    workers.set(id, worker)
  }

  const coordinador = crearCoordinadorSubme({
    alTerminar: (resumen) => {
      primary.emit('message', { type: 'subme-ack', ...resumen })
    },
  })

  const supervisor = new EventEmitter()
  supervisor.on('from-primary', (mensaje) => {
    if (mensaje?.type !== 'request-send-private') return
    const ids = []
    for (const [id, worker] of workers) {
      ids.push(id)
      worker.send({
        type: 'send-private',
        requestId: mensaje.requestId,
        text: mensaje.text,
      })
    }
    coordinador.registrar(mensaje.requestId, ids)
  })
  supervisor.on('from-worker', (id, resultado) => {
    coordinador.resultado(resultado.requestId, id, resultado)
  })

  return { primary, workers, supervisor }
}

function socket(numero, { falla = false } = {}) {
  const enviados = []
  return {
    enviados,
    phoneNumber: numero,
    sendMessage: async (jid, payload) => {
      if (falla) throw new Error('fallo de envío')
      enviados.push({ jid, text: payload?.text })
      return { key: { id: 'ok' } }
    },
  }
}

test('cada sub-bot se escribe a sí mismo y nadie escribe al owner', async () => {
  const a = socket('5211111111111')
  const b = socket('5212222222222')
  const c = socket('5213333333333')
  const { primary } = montar({
    workers: {
      'subbot-group-0': [a, b],
      'subbot-group-1': [c],
    },
  })

  const ack = await requestEnviarPrivadoSubBots({
    processRef: primary,
    text: 'mensaje para el owner',
    timeoutMs: 5000,
  })

  assert.equal(ack.enviados, 3)
  assert.equal(ack.workers, 2)
  assert.deepEqual(ack.fallidos, [])

  // Destino = el propio número de cada sub-bot.
  assert.equal(a.enviados[0].jid, '5211111111111@s.whatsapp.net')
  assert.equal(b.enviados[0].jid, '5212222222222@s.whatsapp.net')
  assert.equal(c.enviados[0].jid, '5213333333333@s.whatsapp.net')
  assert.equal(a.enviados[0].text, 'mensaje para el owner')
})

test('los sub-bots que fallan se listan sin bloquear al resto', async () => {
  const ok = socket('5211111111111')
  const malo = socket('5212222222222', { falla: true })
  const { primary } = montar({
    workers: { 'subbot-group-0': [ok, malo] },
  })

  const ack = await requestEnviarPrivadoSubBots({
    processRef: primary,
    text: 'hola',
    timeoutMs: 5000,
  })

  assert.equal(ack.enviados, 1)
  assert.deepEqual(ack.fallidos, ['5212222222222'])
})

test('sin workers la petición responde con cero', async () => {
  const { primary } = montar({ workers: {} })
  const ack = await requestEnviarPrivadoSubBots({
    processRef: primary,
    text: 'hola',
    timeoutMs: 5000,
  })
  assert.equal(ack.enviados, 0)
  assert.equal(ack.workers, 0)
})

test('sin texto no se envía nada', async () => {
  const { primary } = montar({ workers: { 'subbot-group-0': [socket('5211111111111')] } })
  assert.equal(await requestEnviarPrivadoSubBots({ processRef: primary, text: '' }), null)
})
