import test from 'node:test'
import assert from 'node:assert/strict'
import { prepararIdentidadesPareja, vinculoPareja, gestionarUnion, reclamarDiarioPareja, DIA_PAREJA } from '../lib/parejas.js'

const A = '5211111111111@s.whatsapp.net'
const B = '5222222222222@s.whatsapp.net'
const LA = '777777777777@lid'
const LB = '888888888888@lid'
const chat = 'prueba@g.us'
const desde = 1_700_000_000_000
const crear = () => ({ users: {
  [A]: { partner: B, marriedAt: desde, coins: 100 },
  [B]: { partner: A, marriedAt: desde, coins: 200 },
}, chats: { [chat]: {} } })
const grupoLid = () => [{ id: LA }, { id: LB }]
const conexion = () => ({ decodeJid: j => j, signalRepository: { lidMapping: {
  getPNForLID: async j => ({ [LA]: A, [LB]: B })[j],
  getLIDForPN: async j => ({ [A]: LA, [B]: LB })[j],
} } })
const mensaje = sender => ({ sender, chat, isGroup: true })

test('reproduce y corrige un matrimonio PN válido cuando el remitente y el grupo llegan solo como LID', async () => {
  const d = crear()
  d.users[LA] = { ...d.users[A] }
  const conn = conexion()
  const antes = structuredClone(d)
  assert.equal(vinculoPareja(d, LA, conn, grupoLid()), null)
  const parts = await prepararIdentidadesPareja(mensaje(LA), conn, grupoLid(), d)
  const v = vinculoPareja(d, LA, conn, parts)
  assert.equal(v.a.key, A)
  assert.equal(v.b.key, B)
  assert.equal(v.desde, desde)
  assert.deepEqual(d, antes, 'resolver identidades no debe alterar el matrimonio ni el dinero')
  assert.equal(gestionarUnion(d, { jid: LA, chat, conn, participants: parts }, desde).code, 'solicitud')
  assert.equal(gestionarUnion(d, { jid: LB, chat, accion: 'si', conn, participants: parts }, desde).code, 'activada')
})

test('descubre también la pareja cuando no existe ninguna ficha del LID remitente', async () => {
  const d = crear()
  const conn = conexion()
  const parts = await prepararIdentidadesPareja(mensaje(LA), conn, grupoLid(), d)
  assert.equal(parts[0].phoneNumber, A)
  assert.equal(parts[1].phoneNumber, B)
  assert.equal(vinculoPareja(d, LA, conn, parts).a.key, A)
  assert.equal(gestionarUnion(d, { jid: LA, chat, conn, participants: parts }, desde).code, 'solicitud')
})

test('una ficha PN vacía no oculta el matrimonio antiguo guardado bajo LID', async () => {
  const d = crear()
  d.users[LA] = { ...d.users[A] }
  d.users[A] = { partner: '', coins: 0 }
  const conn = conexion()
  const parts = await prepararIdentidadesPareja(mensaje(LA), conn, grupoLid(), d)
  const v = vinculoPareja(d, LA, conn, parts)
  assert.equal(v.a.key, LA)
  assert.equal(v.b.key, B)
  assert.equal(v.desde, desde)
  assert.equal(reclamarDiarioPareja(d, LA, conn, parts, desde + DIA_PAREJA).premio, 2000)
  assert.equal(d.users[LA].coins, 2100)
  assert.equal(d.users[A].coins, 0, 'no se fusionan saldos de alias')
  assert.equal(reclamarDiarioPareja(d, A, conn, parts, desde + DIA_PAREJA).code, 'espera')
})

test('aprovecha el teléfono alternativo del mensaje aunque no exista lidMapping', async () => {
  const d = crear()
  const conn = { decodeJid: j => j }
  const parts = await prepararIdentidadesPareja({ ...mensaje(LA), senderPn: A }, conn, [{ id: LA }, { id: B }], d)
  assert.equal(vinculoPareja(d, LA, conn, parts).a.key, A)
})

test('no une un teléfono y un LID solo porque sus números coincidan', async () => {
  const d = crear()
  const falsoLid = A.split('@')[0] + '@lid'
  d.users[falsoLid] = { ...d.users[A] }
  const conn = { decodeJid: j => j }
  const parts = await prepararIdentidadesPareja(mensaje(falsoLid), conn, [{ id: falsoLid }, { id: B }], d)
  assert.equal(vinculoPareja(d, falsoLid, conn, parts), null)
})

test('resolver identidades no convierte una relación unilateral en matrimonio ni mueve monedas', async () => {
  const d = crear()
  d.users[B].partner = 'otro@s.whatsapp.net'
  const antes = structuredClone(d)
  const conn = conexion()
  const parts = await prepararIdentidadesPareja(mensaje(LA), conn, grupoLid(), d)
  assert.equal(vinculoPareja(d, LA, conn, parts), null)
  assert.equal(reclamarDiarioPareja(d, LA, conn, parts, desde + DIA_PAREJA).code, 'sin_pareja')
  assert.deepEqual(d, antes)
})

test('refresca metadata incompleta una sola vez y no inventa mapeos si WhatsApp falla', async () => {
  const d = crear()
  let llamadas = 0
  const conn = { decodeJid: j => j, groupMetadata: async () => {
    llamadas++
    return { participants: [{ id: LA, phoneNumber: A }, { id: LB, phoneNumber: B }] }
  } }
  const parts = await prepararIdentidadesPareja(mensaje(LA), conn, grupoLid(), d)
  assert.equal(llamadas, 1)
  assert.equal(vinculoPareja(d, LA, conn, parts).a.key, A)
  const fallida = { decodeJid: j => j, signalRepository: { lidMapping: { getPNForLID: async () => { throw new Error('Sin mapeo') } } } }
  assert.equal(vinculoPareja(d, LA, fallida, await prepararIdentidadesPareja(mensaje(LA), fallida, grupoLid(), d)), null)
})
