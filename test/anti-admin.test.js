import test from 'node:test'
import assert from 'node:assert/strict'
import { verificarAdminAnti } from '../lib/Antis/anti-admin.js'
import { resolverAdminRemitente, obtenerBanderasAdminParticipante } from '../lib/group-participant.js'
import { aplicarCambioParticipantes } from '../lib/group-meta-cache.js'
import { esComandoAnti } from '../lib/Antis/anti-command.js'

const PN = '5211111111111@s.whatsapp.net'
const LID = '777777777777@lid'
const BOT = '5299999999999@s.whatsapp.net'
const CHAT = 'admin-test@g.us'
const mensaje = (id = 'mensaje') => ({ chat: CHAT, sender: LID, isGroup: true, key: { id, participant: LID } })
const conexion = participantes => ({
  decodeJid: j => j,
  groupMetadata: async () => ({ participants: participantes }),
  signalRepository: { lidMapping: {
    getPNForLID: async id => id === LID ? PN : null,
    getLIDForPN: async id => id === PN ? LID : null,
  } },
})

for (const rol of ['admin', 'superadmin', true]) {
  test(`el rol ${rol} protege al remitente LID cuyo administrador figura por teléfono`, async () => {
    const parts = [{ id: PN, admin: rol }, { id: BOT, admin: 'admin' }]
    const conn = conexion(parts)
    const flags = await resolverAdminRemitente(parts, mensaje(), conn)
    assert.equal(flags.isAdmin, true)
    const decision = await verificarAdminAnti(mensaje(), conn)
    assert.equal(decision.isAdmin, true)
    assert.equal(decision.puedeModerar, false)
  })
}

test('resuelve PN hacia LID y registros duplicados con roles distintos', async () => {
  const parts = [{ id: LID, admin: 'admin' }]
  assert.equal((await resolverAdminRemitente(parts, { ...mensaje(), sender: PN, key: {} }, conexion(parts))).isAdmin, true)
  const duplicados = [{ id: LID, admin: null }, { id: PN, admin: true }]
  assert.equal((await resolverAdminRemitente(duplicados, mensaje(), conexion(duplicados))).isAdmin, true)
  assert.equal(obtenerBanderasAdminParticipante([{ id: PN, admin: true }], PN, {}).isAdmin, true)
})

test('un ascenso reciente prevalece sobre metadata local y flags antiguos', async () => {
  const conn = conexion([{ id: PN, admin: 'admin' }])
  conn.chats = { [CHAT]: { metadata: { participants: [{ id: PN, admin: null }] } } }
  const r = await verificarAdminAnti(mensaje(), conn, conn.chats[CHAT].metadata.participants)
  assert.equal(r.puedeModerar, false)
  assert.equal(r.isAdmin, true)
  assert.equal(conn.chats[CHAT].metadata.participants[0].admin, 'admin')
})

test('un usuario degradado no conserva inmunidad por el flag o cache anterior', async () => {
  const conn = conexion([{ id: PN, admin: null }])
  const r = await verificarAdminAnti(mensaje(), conn, [{ id: PN, admin: 'admin' }])
  assert.equal(r.isAdmin, false)
  assert.equal(r.puedeModerar, true)
})

test('no confunde números iguales entre dominios ni acepta al admin citado o mencionado', async () => {
  const mismoNumero = PN.replace('@s.whatsapp.net', '@lid')
  const parts = [{ id: PN, admin: 'admin' }, { id: mismoNumero, admin: null }]
  const conn = { decodeJid: j => j, groupMetadata: async () => ({ participants: parts }) }
  const m = { ...mensaje(), sender: mismoNumero, key: { participant: mismoNumero }, quoted: { sender: PN }, mentionedJid: [PN] }
  const r = await verificarAdminAnti(m, conn)
  assert.equal(r.isAdmin, false)
  assert.equal(r.puedeModerar, true)
})

test('participantAlt oficial identifica al administrador sin depender del mapeo', async () => {
  const conn = { groupMetadata: async () => ({ participants: [{ id: PN, admin: 'admin' }] }) }
  const m = { ...mensaje(), key: { participant: LID, participantAlt: PN } }
  assert.equal((await verificarAdminAnti(m, conn)).isAdmin, true)
})

test('sin metadata o sin identidad verificable no sanciona ni concede privilegios', async () => {
  const conn = { groupMetadata: async () => { throw new Error('Sin conexión') } }
  const r = await verificarAdminAnti(mensaje(), conn, [{ id: PN, admin: null }])
  assert.equal(r.puedeModerar, false)
  assert.equal(r.isAdmin, false)
  const desconocido = await verificarAdminAnti(mensaje(), conexion([{ id: BOT, admin: 'admin' }]))
  assert.equal(desconocido.puedeModerar, false)
  assert.equal(desconocido.identificado, false)
})

test('reconoce al creador verificado aunque falte su campo admin', async () => {
  const conn = conexion([{ id: PN }])
  conn.groupMetadata = async () => ({ owner: PN, participants: [{ id: PN }] })
  const r = await verificarAdminAnti(mensaje(), conn)
  assert.equal(r.isAdmin, true)
  assert.equal(r.isRAdmin, true)
})

test('varios antis comparten consulta por mensaje, pero otro mensaje vuelve a verificar el rol', async () => {
  let llamadas = 0
  let admin = null
  const conn = conexion([])
  conn.groupMetadata = async () => { llamadas++; return { participants: [{ id: PN, admin }] } }
  const m = mensaje()
  const decisiones = await Promise.all(Array.from({ length: 12 }, () => verificarAdminAnti(m, conn)))
  assert.equal(llamadas, 1)
  assert.ok(decisiones.every(r => r.puedeModerar))
  admin = 'admin'
  assert.equal((await verificarAdminAnti(mensaje('otro'), conn)).puedeModerar, false)
  assert.equal(llamadas, 2)
})

test('los eventos de ascenso, descenso, alta y baja aceptan objetos con PN y LID', () => {
  const conn = { decodeJid: j => j }
  const meta = { participants: [{ id: PN, lid: LID, admin: null }] }
  aplicarCambioParticipantes(meta, [{ id: LID, phoneNumber: PN }], 'promote', conn)
  assert.equal(obtenerBanderasAdminParticipante(meta.participants, PN, conn).isAdmin, true)
  aplicarCambioParticipantes(meta, [LID], 'demote', conn)
  assert.equal(obtenerBanderasAdminParticipante(meta.participants, PN, conn).isAdmin, false)
  aplicarCambioParticipantes(meta, [{ id: LID, phoneNumber: PN }], 'add', conn)
  assert.equal(meta.participants.length, 1)
  aplicarCambioParticipantes(meta, [{ id: LID }], 'remove', conn)
  assert.equal(meta.participants.length, 0)
  aplicarCambioParticipantes(meta, [{ id: PN, lid: LID, admin: true }], 'add', conn)
  assert.equal(meta.participants[0].id, PN)
  assert.equal(meta.participants[0].admin, true)
})

test('un punto o una barra dentro de un link no lo convierten en comando', () => {
  const previo = global.prefix
  try {
    global.prefix = ['.', '/']
    assert.equal(esComandoAnti({ text: 'visita https://example.com' }), false)
    assert.equal(esComandoAnti({ text: '/play enlace' }), true)
    global.prefix = /^\./g
    assert.equal(esComandoAnti({ text: '.menu' }), true)
    assert.equal(esComandoAnti({ text: '.menu' }), true)
    assert.equal(global.prefix.lastIndex, 0)
  } finally { global.prefix = previo }
})
