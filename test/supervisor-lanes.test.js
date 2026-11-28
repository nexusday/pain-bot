import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buscarCarrilDestino,
  crearCarrilAuto,
  esCarrilAuto,
} from '../lib/supervisor-lanes.js'

test('supervisor-lanes: Automático nunca devuelve el carril principal', () => {
  const principal = { id: 0, serverId: null, primary: true, sessions: [] }
  const auto = { id: 4, serverId: null, primary: false, sessions: [] }
  const servidor = { id: 5, serverId: 3, primary: false, sessions: [] }

  assert.equal(esCarrilAuto(principal), false)
  assert.equal(esCarrilAuto(auto), true)

  const destino = buscarCarrilDestino([principal, auto, servidor], null)
  assert.equal(destino, auto)
  assert.notEqual(destino, principal)

  const sinAuto = buscarCarrilDestino([principal, servidor], null)
  assert.equal(sinAuto, null, 'sin carril automático debe crearse uno, no usar el principal')
})

test('supervisor-lanes: un servidor numérico va a su carril, no al principal', () => {
  const principal = { id: 0, serverId: null, primary: true, sessions: [] }
  const servidor3 = { id: 2, serverId: 3, primary: false, sessions: [] }
  const servidor5 = { id: 1, serverId: 5, primary: false, sessions: [] }

  assert.equal(buscarCarrilDestino([principal, servidor3, servidor5], 5), servidor5)
  assert.equal(buscarCarrilDestino([principal, servidor3, servidor5], '3'), servidor3)
  assert.equal(buscarCarrilDestino([principal, servidor3], 99), null)
})

test('supervisor-lanes: crearCarrilAuto no es principal y arranca sin hijos', () => {
  const carril = crearCarrilAuto(7)
  assert.equal(carril.id, 7)
  assert.equal(carril.primary, false)
  assert.equal(carril.serverId, null)
  assert.deepEqual(carril.sessions, [])
  assert.equal(carril.child, null)
})
