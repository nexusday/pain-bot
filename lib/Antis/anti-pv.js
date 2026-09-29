import { numeroBotDe, esDuenoPrincipal } from '../staff.js'
import { numerosIdentidadBot } from '../../plugins/modo-sub.js'
import { candidatosJidRemitente } from '../group-participant.js'

function mapaAntipv() {
  if (!global.db.data) global.db.data = {}
  if (!global.db.data.antipv || typeof global.db.data.antipv !== 'object' || Array.isArray(global.db.data.antipv)) {
    global.db.data.antipv = {}
  }
  return global.db.data.antipv
}

export function numeroDeBot(conn) {
  return numeroBotDe(conn) || ''
}

export function antipvActivo(conn) {
  const numero = numeroDeBot(conn)
  if (!numero || !global.db?.data?.antipv) return false
  return global.db.data.antipv[numero] === true
}

export function establecerAntipv(conn, activo) {
  const numero = numeroDeBot(conn)
  if (!numero) return false
  mapaAntipv()[numero] = activo === true
  return true
}

function numeroDeJid(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '')
}

export function esOwnerDeEsteBot(conn, msg) {
  if (esDuenoPrincipal(msg, conn)) return true
  const ids = numerosIdentidadBot(conn)
  if (!ids.size) return false
  return candidatosJidRemitente(msg, conn).some((jid) => ids.has(numeroDeJid(jid)))
}

function esChatPrivado(msg) {
  if (msg?.isGroup === true) return false
  if (msg?.isGroup === false) return true
  const jid = String(msg?.key?.remoteJid || msg?.chat || '')
  if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') return false
  return true
}

/** Privado de gente que no es owner de este bot. No responde y no llega al visto. */
export function antipvDebeIgnorar(conn, msg) {
  if (!antipvActivo(conn)) return false
  if (!esChatPrivado(msg)) return false
  if (msg?.key?.fromMe) return false
  if (esOwnerDeEsteBot(conn, msg)) return false
  return true
}
