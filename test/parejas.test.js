import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { ArchivoSqliteCompartido } from '../lib/db-sqlite.js'
import { gestionarUnion, vinculoPareja, unionActiva, agruparTopParejas, reclamarDiarioPareja, estadoDiarioPareja, DIA_PAREJA } from '../lib/parejas.js'
import { COMANDOS_SIN_COMISION } from '../lib/pareja-comision.js'

const A = '5211111111111@s.whatsapp.net'
const B = '5222222222222@s.whatsapp.net'
const C = '5233333333333@s.whatsapp.net'
const CHAT = 'grupo@g.us'
const participants = [A, B, C].map(id => ({ id }))
const conn = { decodeJid: j => j }
const desde = 1_700_000_000_000
const crear = () => ({ users: {
  [A]: { name: 'Ana', partner: B, marriedAt: desde, coins: 100, bancoDinero: 20 },
  [B]: { name: 'Bruno', partner: A, marriedAt: desde, coins: 200, bancoDinero: 30 },
  [C]: { name: 'Carla', coins: 300 },
}, chats: { [CHAT]: {} } })
const union = (d, jid, accion = '', ahora = desde) => gestionarUnion(d, { jid, chat: CHAT, accion, conn, participants }, ahora)

test('unip requiere matrimonio mutuo y ambos participantes en el grupo', () => {
  const d = crear()
  assert.equal(union(d, C).code, 'sin_pareja')
  delete d.users[B].partner
  assert.equal(union(d, A).code, 'sin_pareja')
  const otro = crear()
  assert.equal(gestionarUnion(otro, { jid: A, chat: CHAT, conn, participants: [{ id: A }] }, desde).code, 'ausente')
})

test('solo la pareja acepta, la unión es global y no mueve ni un saldo', () => {
  const d = crear()
  const antes = structuredClone(d.users)
  assert.equal(union(d, A).code, 'solicitud')
  assert.equal(union(d, A, 'si').code, 'solo_pareja')
  assert.equal(union(d, C, 'si').code, 'sin_pareja')
  assert.equal(union(d, B, 'si').code, 'activada')
  for (const jid of [A, B]) {
    assert.equal(d.users[jid].coins, antes[jid].coins)
    assert.equal(d.users[jid].bancoDinero, antes[jid].bancoDinero)
  }
  const v = vinculoPareja(d, A, conn, participants)
  assert.equal(unionActiva(d, CHAT, v, conn, participants), true)
  assert.equal(unionActiva(d, 'otro@g.us', v, conn, []), true)
  assert.equal(unionActiva(d, A, v, conn, []), true)
  assert.equal(unionActiva(d, CHAT, v, conn, [{ id: A }]), true)
  assert.equal(gestionarUnion(d, { jid: A, chat: 'otro@g.us', conn, participants: [] }, desde).code, 'ya_activa')
})

test('rechazar, caducar y desactivar no requieren transferencias ni dejan una aceptación válida', () => {
  const d = crear()
  union(d, A)
  assert.equal(union(d, B, 'no').code, 'rechazada')
  assert.equal(union(d, B, 'si').code, 'sin_solicitud')
  union(d, A)
  assert.equal(union(d, B, 'si', desde + 60_000).code, 'expirada')
  union(d, A)
  union(d, B, 'si')
  assert.equal(union(d, B, 'off').code, 'desactivada')
  assert.equal(union(d, A, 'estado').activa, false)
})

test('divorcio, cambio de pareja y nuevo matrimonio invalidan la unión anterior', () => {
  const d = crear()
  union(d, A)
  union(d, B, 'si')
  delete d.users[B].partner
  assert.equal(vinculoPareja(d, A, conn, participants), null)
  d.users[B].partner = A
  d.users[A].marriedAt += 1
  d.users[B].marriedAt += 1
  assert.equal(union(d, A, 'estado').activa, false)
})

test('top suma pareja una sola vez, conserva individuos y no altera saldos', () => {
  const d = crear()
  union(d, A)
  union(d, B, 'si')
  const filas = Object.entries(d.users).map(([jid, u]) => ({ jid, name: u.name, coins: u.coins + (u.bancoDinero || 0) }))
  const antes = structuredClone(d)
  const top = agruparTopParejas(filas, d, CHAT, conn, participants).sort((a, b) => b.coins - a.coins)
  assert.equal(top.length, 2)
  assert.equal(top[0].coins, 350)
  assert.deepEqual(top[0].pareja, [A, B])
  assert.equal(top[1].jid, C)
  assert.deepEqual(d, antes)
  assert.equal(agruparTopParejas(filas, d, 'otro@g.us', conn, []).length, 2)
  assert.equal(agruparTopParejas(filas, d, A, conn, []).length, 2)
})

test('desactivar desde otro grupo separa globalmente e invalida propuestas antiguas', () => {
  const d = crear()
  union(d, A)
  gestionarUnion(d, { jid: A, chat: 'otro@g.us', conn, participants }, desde)
  assert.equal(union(d, B, 'si').code, 'activada')
  assert.equal(gestionarUnion(d, { jid: A, chat: 'tercero@g.us', accion: 'off', conn, participants: [{ id: A }] }, desde).code, 'desactivada')
  assert.equal(union(d, A, 'estado').activa, false)
  assert.equal(gestionarUnion(d, { jid: B, chat: 'otro@g.us', accion: 'si', conn, participants }, desde).code, 'invalidada')
  assert.equal(union(d, A, 'estado').activa, false)
  assert.equal(union(d, A).code, 'solicitud')
})

test('las uniones locales antiguas no se convierten en un consentimiento global', () => {
  const d = crear()
  const v = vinculoPareja(d, A, conn, participants)
  d.chats[CHAT].parejasTop = { [v.key]: { miembros: [A, B], desde } }
  d.chats[CHAT].parejaTopSolicitud = { key: v.key, proposer: A, target: B, expira: desde + 60_000 }
  assert.equal(union(d, A, 'estado').activa, false)
  assert.equal(union(d, B, 'si').code, 'invalidada')
  assert.equal(union(d, A).code, 'solicitud')
  assert.equal(union(d, B, 'si').code, 'activada')
})

test('top harem suma valor y unidades pero cuenta tipos distintos entre ambos', () => {
  const d = crear()
  union(d, A)
  union(d, B, 'si')
  const filas = [
    { jid: A, name: 'Ana', units: 3, types: 2, value: 10, typeIds: ['1', '2'] },
    { jid: B, name: 'Bruno', units: 4, types: 2, value: 20, typeIds: ['2', '3'] },
  ]
  const [fila] = agruparTopParejas(filas, d, CHAT, conn, participants, ['units', 'types', 'value'])
  assert.equal(fila.units, 7)
  assert.equal(fila.types, 3)
  assert.equal(fila.value, 30)
})

test('LID y teléfono resuelven al mismo miembro sin pagar ni sumar duplicado', () => {
  const d = crear()
  const lid = '999999999999@lid'
  const grupo = [{ id: lid, phoneNumber: A }, { id: B }]
  d.users[lid] = { ...d.users[A] }
  assert.equal(vinculoPareja(d, lid, conn, grupo).a.key, A)
  const filas = [A, lid, B].map(jid => ({ jid, name: d.users[jid].name, coins: d.users[jid].coins }))
  assert.equal(agruparTopParejas(filas, d, CHAT, conn, grupo).length, 2)
  assert.equal(reclamarDiarioPareja(d, lid, conn, grupo, desde + DIA_PAREJA).premio, 2000)
  assert.equal(reclamarDiarioPareja(d, A, conn, grupo, desde + DIA_PAREJA).code, 'espera')
  assert.equal(d.users[A].coins, 2100)
})

test('dma espera un día de matrimonio y paga a ambos una sola vez sin tocar el banco', () => {
  const d = crear()
  assert.equal(reclamarDiarioPareja(d, A, conn, participants, desde + DIA_PAREJA - 1).code, 'espera')
  const r = reclamarDiarioPareja(d, A, conn, participants, desde + DIA_PAREJA)
  assert.equal(r.premio, 2000)
  assert.equal(d.users[A].coins, 2100)
  assert.equal(d.users[B].coins, 2200)
  assert.equal(d.users[A].bancoDinero, 20)
  assert.equal(reclamarDiarioPareja(d, B, conn, participants, desde + DIA_PAREJA).code, 'espera')
  assert.equal(d.users[B].coins, 2200)
  assert.equal(COMANDOS_SIN_COMISION.has('dma'), true)
})

test('dma da racha con tope y extra semanal sin acumular todos los días perdidos', () => {
  const d = crear()
  let resultado
  for (let dia = 1; dia <= 14; dia++) {
    resultado = reclamarDiarioPareja(d, A, conn, participants, desde + dia * DIA_PAREJA)
    if (dia === 7) assert.equal(resultado.premio, 4200)
  }
  assert.equal(resultado.premio, 5000)
  assert.equal(resultado.racha, 14)
  const reinicio = reclamarDiarioPareja(d, B, conn, participants, desde + 30 * DIA_PAREJA)
  assert.equal(reinicio.racha, 1)
  assert.equal(reinicio.premio, 2000)
})

test('dma rechaza matrimonios sin fecha y mantiene el cooldown individual tras volver a casarse', () => {
  const d = crear()
  delete d.users[A].marriedAt
  delete d.users[B].marriedAt
  assert.equal(estadoDiarioPareja(vinculoPareja(d, A, conn, participants)).sinFecha, true)
  assert.equal(reclamarDiarioPareja(d, A, conn, participants).code, 'sin_fecha')
  d.users[A].marriedAt = desde
  d.users[B].marriedAt = desde
  reclamarDiarioPareja(d, A, conn, participants, desde + 10 * DIA_PAREJA)
  d.users[A].marriedAt = desde + DIA_PAREJA
  d.users[B].marriedAt = desde + DIA_PAREJA
  delete d.users[A].diarioPareja
  delete d.users[B].diarioPareja
  assert.equal(reclamarDiarioPareja(d, A, conn, participants, desde + 10 * DIA_PAREJA).code, 'espera')
})

test('dos procesos SQLite que reclaman a la vez solo acreditan un premio a cada cónyuge', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pain-pareja-'))
  const archivo = path.join(dir, 'test.sqlite')
  const legado = path.join(dir, 'test.json')
  const adaptadores = []
  try {
    const inicial = crear()
    inicial.users[A].marriedAt = Date.now() - 2 * DIA_PAREJA
    inicial.users[B].marriedAt = inicial.users[A].marriedAt
    await fs.writeFile(legado, JSON.stringify(inicial))
    for (let i = 0; i < 2; i++) adaptadores.push(new ArchivoSqliteCompartido(archivo, legado))
    const vivos = await Promise.all(adaptadores.map(a => a.read()))
    const resultados = await Promise.all(adaptadores.map((a, i) => a.claimAndUpdate(vivos[i], `dma:${i}`, DIA_PAREJA,
      (datos, ahora) => reclamarDiarioPareja(datos, i ? B : A, conn, participants, ahora))))
    assert.equal(resultados.filter(r => r.result.code === 'premio').length, 1)
    assert.equal(resultados.filter(r => r.result.code === 'espera').length, 1)
    const actual = await adaptadores[0].read()
    assert.equal(actual.users[A].coins, 2100)
    assert.equal(actual.users[B].coins, 2200)
  } finally {
    for (const a of adaptadores) await a.close?.()
    await fs.rm(dir, { recursive: true, force: true })
  }
})
