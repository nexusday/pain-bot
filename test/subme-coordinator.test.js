import test from 'node:test'
import assert from 'node:assert/strict'
import { crearCoordinadorSubme } from '../lib/subme-coordinator.js'

test('el ack llega cuando todos los workers responden', () => {
  const acks = []
  const coordinador = crearCoordinadorSubme({ alTerminar: (resumen) => acks.push(resumen) })

  coordinador.registrar('req-1', ['subbot-group-0', 'subbot-group-1'])
  assert.equal(acks.length, 0)

  coordinador.resultado('req-1', 'subbot-group-0', { enviados: 30, fallidos: ['5211111111111'] })
  assert.equal(acks.length, 0)

  const resumen = coordinador.resultado('req-1', 'subbot-group-1', { enviados: 28, fallidos: [] })
  assert.equal(acks.length, 1)
  assert.equal(resumen.enviados, 58)
  assert.deepEqual(resumen.fallidos, ['5211111111111'])
  assert.equal(resumen.workers, 2)
  assert.equal(coordinador.pendientes(), 0)
})

test('sin workers responde de inmediato con cero', () => {
  const acks = []
  const coordinador = crearCoordinadorSubme({ alTerminar: (resumen) => acks.push(resumen) })

  coordinador.registrar('req-2', [])
  assert.equal(acks.length, 1)
  assert.equal(acks[0].enviados, 0)
  assert.equal(acks[0].workers, 0)
})

test('un resultado de un worker desconocido no rompe nada', () => {
  const acks = []
  const coordinador = crearCoordinadorSubme({ alTerminar: (resumen) => acks.push(resumen) })
  assert.equal(coordinador.resultado('req-inexistente', 'subbot-group-0', { enviados: 1 }), null)
  assert.equal(acks.length, 0)
})

test('el timeout cierra la petición con lo que haya llegado', async () => {
  const acks = []
  const coordinador = crearCoordinadorSubme({
    alTerminar: (resumen) => acks.push(resumen),
    timeoutMs: 30,
  })
  coordinador.registrar('req-3', ['subbot-group-0', 'subbot-group-1'])
  coordinador.resultado('req-3', 'subbot-group-0', { enviados: 10, fallidos: [] })
  await new Promise((resolve) => setTimeout(resolve, 60))
  assert.equal(acks.length, 1)
  assert.equal(acks[0].enviados, 10)
  assert.equal(acks[0].workers, 2)
})
