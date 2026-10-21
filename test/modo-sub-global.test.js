import assert from 'node:assert/strict'
import test from 'node:test'
import { elegirQuienResponde, listarBotsEnGrupoGlobal } from '../plugins/modo-sub.js'

function connFalso(numero, { remoto = false } = {}) {
  return {
    user: { jid: `${numero}@s.whatsapp.net`, id: `${numero}@s.whatsapp.net` },
    phoneNumber: numero,
    ws: { socket: { readyState: 1 } },
    sendMessage: async () => {},
    _principalRemoto: remoto,
  }
}

test('modosub: solo contesta el proceso dueño del bot elegido', () => {
  const local1 = connFalso('5215500000001')
  const local2 = connFalso('5215500000002')
  const remoto = { number: '5215500000003', conn: null, connected: true, ids: new Set(['5215500000003']) }
  const bots = [
    { number: '5215500000001', conn: local1, connected: true },
    { number: '5215500000002', conn: local2, connected: true },
    remoto,
  ]

  // Cada proceso contesta únicamente por el bot que le pertenece.
  assert.equal(elegirQuienResponde(bots, local1, bots[0]).number, '5215500000001')
  assert.equal(elegirQuienResponde(bots, local2, bots[1]).number, '5215500000002')

  // El proceso que NO es dueño del bot elegido se queda callado.
  assert.equal(elegirQuienResponde(bots, local1, bots[1]), null)
  assert.equal(elegirQuienResponde(bots, local2, remoto), null)

  // Sin selección (índice inválido o "all") contesta uno solo.
  assert.equal(elegirQuienResponde(bots, local1).number, '5215500000001')
  assert.equal(elegirQuienResponde(bots, local2).number, '5215500000002')

  // Si el elegido está desconectado, contesta el responsable (uno solo).
  const desconectado = { number: '5215500000004', conn: null, connected: false }
  const conDesconectado = elegirQuienResponde([desconectado, bots[0]], local1, desconectado)
  assert.equal(conDesconectado?.number, '5215500000001')
})

test('modosub: la lista global ordena principal y sub-bots del grupo', () => {
  const anteriorConn = global.conn
  const anteriorConns = global.conns
  const principal = connFalso('5215500000001')
  const sub = connFalso('5215500000002')
  global.conn = principal
  global.conns = [sub]
  try {
    const participantes = [
      { id: '5215500000001@s.whatsapp.net' },
      { id: '5215500000002@s.whatsapp.net' },
      { id: '5215500000999@s.whatsapp.net' },
    ]
    const bots = listarBotsEnGrupoGlobal(participantes)
    assert.equal(bots.length, 2)
    assert.equal(bots[0].number, '5215500000001')
    assert.equal(bots[0].type, 'principal')
    assert.equal(bots[0].index, 1)
    assert.equal(bots[1].number, '5215500000002')
    assert.equal(bots[1].type, 'subbot')
    assert.equal(bots[1].index, 2)
  } finally {
    if (anteriorConn === undefined) delete global.conn
    else global.conn = anteriorConn
    if (anteriorConns === undefined) delete global.conns
    else global.conns = anteriorConns
  }
})
