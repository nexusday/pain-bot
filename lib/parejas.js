import { createHash } from 'node:crypto'
import { findGroupParticipant, resolveTargetJids } from './group-participant.js'

export const DIA_PAREJA = 86_400_000
export const TTL_UNION = 60_000

export function usuarioPareja(datos, jid, conn, participants = []) {
  const ids = resolveTargetJids(jid, participants, conn)
  ids.sort((a, b) => Number(b.endsWith('@s.whatsapp.net')) - Number(a.endsWith('@s.whatsapp.net')))
  const key = ids.find(id => datos.users?.[id]) || jid
  return { key, user: datos.users?.[key] }
}

export function vinculoPareja(datos, jid, conn, participants = []) {
  const a = usuarioPareja(datos, jid, conn, participants)
  if (!a.user?.partner) return null
  const b = usuarioPareja(datos, a.user.partner, conn, participants)
  if (!b.user?.partner || a.key === b.key) return null
  const vuelta = usuarioPareja(datos, b.user.partner, conn, participants)
  if (vuelta.key !== a.key) return null
  const miembros = [a, b].sort((x, y) => x.key.localeCompare(y.key))
  const firma = miembros.map(x => [x.key, Number(x.user.marriedAt) || 0])
  const key = createHash('sha256').update(JSON.stringify(firma)).digest('hex').slice(0, 24)
  return { a, b, key, desde: Math.max(Number(a.user.marriedAt) || 0, Number(b.user.marriedAt) || 0) }
}

export function unionActiva(datos, chat, vinculo) {
  // El chat solo sirve para enviar la propuesta. El consentimiento se guarda
  // en ambos usuarios y se aplica a todos los tops, sin depender del grupo.
  return !!(vinculo && vinculo.a.user.unionTopGlobal?.key === vinculo.key &&
    vinculo.b.user.unionTopGlobal?.key === vinculo.key)
}

const revisionUnion = user => Number(user.revisionUnionTop) || 0
const solicitudVigente = (solicitud, v) => solicitud?.scope === 'global' && solicitud.key === v.key &&
  solicitud.revisiones?.[v.a.key] === revisionUnion(v.a.user) && solicitud.revisiones?.[v.b.key] === revisionUnion(v.b.user)

export function gestionarUnion(datos, { jid, chat, accion = '', conn, participants = [] }, ahora = Date.now()) {
  const v = vinculoPareja(datos, jid, conn, participants)
  if (!v) return { claim: false, code: 'sin_pareja' }
  const grupo = datos.chats?.[chat]
  if (accion === 'estado') return { claim: false, code: 'estado', activa: unionActiva(datos, chat, v, conn, participants) }
  if (accion === 'off') {
    for (const { user } of [v.a, v.b]) {
      delete user.unionTopGlobal
      // Invalida también propuestas pendientes en otros grupos.
      user.revisionUnionTop = revisionUnion(user) + 1
    }
    if (grupo?.parejasTop) delete grupo.parejasTop[v.key]
    if (grupo?.parejaTopSolicitud?.key === v.key) delete grupo.parejaTopSolicitud
    return { code: 'desactivada' }
  }
  if (!accion && unionActiva(datos, chat, v)) return { claim: false, code: 'ya_activa' }
  if (!findGroupParticipant(participants, v.a.key, conn) || !findGroupParticipant(participants, v.b.key, conn)) {
    return { claim: false, code: 'ausente' }
  }
  const solicitud = grupo?.parejaTopSolicitud
  if (['si', 'no'].includes(accion)) {
    if (!solicitud || solicitud.key !== v.key) return { claim: false, code: 'sin_solicitud' }
    if (solicitud.target !== v.a.key) return { claim: false, code: 'solo_pareja' }
    if (!solicitudVigente(solicitud, v)) {
      delete grupo.parejaTopSolicitud
      return { code: 'invalidada' }
    }
    if (ahora >= solicitud.expira) {
      delete grupo.parejaTopSolicitud
      return { code: 'expirada' }
    }
    delete grupo.parejaTopSolicitud
    if (accion === 'no') return { code: 'rechazada' }
    for (const { user } of [v.a, v.b]) {
      user.unionTopGlobal = { key: v.key, desde: ahora }
      user.revisionUnionTop = revisionUnion(user) + 1
    }
    return { code: 'activada', miembros: [v.a.key, v.b.key] }
  }
  if (solicitud && solicitud.expira > ahora && solicitud.scope === 'global' &&
    (solicitud.key !== v.key || solicitudVigente(solicitud, v))) return { claim: false, code: 'pendiente' }
  datos.chats ||= {}
  datos.chats[chat] ||= {}
  datos.chats[chat].parejaTopSolicitud = {
    key: v.key, proposer: v.a.key, target: v.b.key, expira: ahora + TTL_UNION, scope: 'global',
    revisiones: { [v.a.key]: revisionUnion(v.a.user), [v.b.key]: revisionUnion(v.b.user) },
  }
  return { code: 'solicitud', miembros: [v.a.key, v.b.key] }
}

export function estadoDiarioPareja(v, ahora = Date.now()) {
  if (!v?.desde) return { disponible: false, sinFecha: true, restante: 0, racha: 0 }
  const anteriores = [v.a.user.diarioPareja, v.b.user.diarioPareja].filter(x => x?.key === v.key)
  const ultimo = anteriores.reduce((max, x) => Math.max(max, Number(x.ultimo) || 0), 0)
  const independiente = Math.max(Number(v.a.user.ultimoPremioMatrimonio) || 0, Number(v.b.user.ultimoPremioMatrimonio) || 0)
  const siguiente = Math.max(v.desde + DIA_PAREJA, ultimo ? ultimo + DIA_PAREJA : 0, independiente ? independiente + DIA_PAREJA : 0)
  const racha = ultimo && ahora - ultimo <= 2 * DIA_PAREJA
    ? Math.max(...anteriores.map(x => Number(x.racha) || 0), 0) : 0
  return { disponible: ahora >= siguiente, restante: Math.max(0, siguiente - ahora), racha, ultimo }
}

export function reclamarDiarioPareja(datos, jid, conn, participants = [], ahora = Date.now()) {
  const v = vinculoPareja(datos, jid, conn, participants)
  if (!v) return { claim: false, code: 'sin_pareja' }
  const estado = estadoDiarioPareja(v, ahora)
  if (estado.sinFecha) return { claim: false, code: 'sin_fecha' }
  if (!estado.disponible) return { claim: false, code: 'espera', restante: estado.restante }
  const racha = estado.racha + 1
  const extra = racha % 7 === 0 ? 1000 : 0
  const premio = 2000 + Math.min(10, racha - 1) * 200 + extra
  for (const { user } of [v.a, v.b]) {
    user.coins = (Number(user.coins) || 0) + premio
    user.ultimoPremioMatrimonio = ahora
    user.diarioPareja = { key: v.key, ultimo: ahora, racha }
  }
  return { code: 'premio', premio, extra, racha, miembros: [v.a.key, v.b.key] }
}

/** Suma visualmente filas, nunca modifica saldos ni colecciones. */
export function agruparTopParejas(filas, datos, chat, conn, participants = [], campos = ['coins']) {
  const mapa = new Map()
  for (const fila of filas) {
    const key = usuarioPareja(datos, fila.jid, conn, participants).key
    // PN y LID del mismo usuario no deben ocupar dos puestos ni sumar dos veces.
    if (!mapa.has(key) || fila.jid === key) mapa.set(key, { ...fila, jid: key })
  }
  const salida = []
  const vistos = new Set()
  for (const [key, fila] of mapa) {
    if (vistos.has(key)) continue
    vistos.add(key)
    const v = vinculoPareja(datos, key, conn, participants)
    if (!unionActiva(datos, chat, v, conn, participants)) { salida.push(fila); continue }
    const otra = mapa.get(v.b.key)
    // Una pareja sin dinero/harem también puede aparecer junto a quien sí tiene.
    const combinada = { ...fila, pareja: [key, v.b.key], nombres: [fila.name, otra?.name || v.b.user.name || 'Usuario'] }
    for (const campo of campos) combinada[campo] = (Number(fila[campo]) || 0) + (Number(otra?.[campo]) || 0)
    if (fila.typeIds && otra?.typeIds) combinada.types = new Set([...fila.typeIds, ...otra.typeIds]).size
    salida.push(combinada)
    vistos.add(v.b.key)
  }
  return salida
}

export function tiempoPareja(ms) {
  const minutos = Math.max(1, Math.ceil(ms / 60_000))
  return `${Math.floor(minutos / 60)} h ${minutos % 60} min`
}
