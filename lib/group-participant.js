/**
 * Empareja sender ↔ participante de grupo con Baileys (LID + PN).
 
 */

function decodificarSiPosible(conn, jid) {
  if (!jid) return ''
  try {
    return conn?.decodeJid?.(jid) || String(jid)
  } catch {
    return String(jid)
  }
}

function digitosUsuario(jid = '') {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '')
}

function comoJidLid(value) {
  if (!value) return ''
  const s = String(value)
  if (s.includes('@')) return s
  return `${s.replace(/\D/g, '')}@lid`
}

function comoJidPn(value) {
  if (!value) return ''
  const s = String(value)
  if (s.includes('@')) return s
  const digitos = s.replace(/\D/g, '')
  return digitos ? `${digitos}@s.whatsapp.net` : ''
}

export function jidsParticipante(p, conn) {
  if (!p) return []
  const lista = [
    p.id,
    p.jid,
    p.lid ? comoJidLid(p.lid) : '',
    p.phoneNumber ? comoJidPn(p.phoneNumber) : '',
  ]
    .filter(Boolean)
    .map(j => decodificarSiPosible(conn, j))
  return [...new Set(lista.filter(Boolean))]
}

export function candidatosJidRemitente(m, conn, extra = []) {
  if (!m && !extra.length) return []

  const delMensaje = m
    ? [
        m.sender,
        m.participant,
        m.key?.participant,
        m.key?.participantAlt,
        m.key?.remoteJidAlt,
        m.senderPn,
        m.participantPn,
        m.participantAlt,

        m.key?.participant && String(m.key.participant).endsWith('@lid')
          ? m.key.participant
          : null,
      ]
    : []

  const lista = [...delMensaje, ...extra]
    .filter(Boolean)
    .map(j => decodificarSiPosible(conn, j))

  return [...new Set(lista.filter(Boolean))]
}

export function jidsSeSolapan(aList, bList) {
  const setA = new Set((aList || []).map(String))
  for (const b of bList || []) {
    if (setA.has(String(b))) return true
  }

  const digitosA = new Set((aList || []).map(digitosUsuario).filter(d => d.length >= 6))
  for (const b of bList || []) {
    const d = digitosUsuario(b)
    if (d.length >= 6 && digitosA.has(d)) return true
  }
  return false
}

export function resolverJidsObjetivo(who, participants, conn) {
  const base = candidatosJidRemitente(null, conn, [who].filter(Boolean))
  const p = buscarParticipanteGrupo(participants, who, conn)
  const delParticipante = jidsParticipante(p, conn)
  return [...new Set([...base, ...delParticipante].filter(Boolean))]
}

export function esRemitenteMuteado(mutedList, m, conn, participants) {
  if (!Array.isArray(mutedList) || !mutedList.length) return false

  const idsRemitente = candidatosJidRemitente(m, conn)
  if (jidsSeSolapan(idsRemitente, mutedList)) return true

  const p = buscarParticipanteGrupo(participants, m, conn)
  if (p && jidsSeSolapan(jidsParticipante(p, conn), mutedList)) return true

  return false
}

export function quitarCoincidenciasMuteadas(mutedList, targetJids) {
  if (!Array.isArray(mutedList)) return []
  const objetivos = Array.isArray(targetJids) ? targetJids : [targetJids]
  return mutedList.filter(j => !jidsSeSolapan([j], objetivos))
}

/**
 * Busca el participante que corresponde al mensaje / jid.
 * @param {Array} participants
 * @param {object|string|string[]} mOrJid - mensaje, jid, o lista de jids
 * @param {object} conn
 */
export function buscarParticipanteGrupo(participants, mOrJid, conn) {
  if (!Array.isArray(participants) || !participants.length) return null

  let objetivos = []
  if (mOrJid && typeof mOrJid === 'object' && !Array.isArray(mOrJid) && (mOrJid.key || mOrJid.sender)) {
    objetivos = candidatosJidRemitente(mOrJid, conn)
  } else if (Array.isArray(mOrJid)) {
    objetivos = candidatosJidRemitente(null, conn, mOrJid)
  } else if (mOrJid) {
    objetivos = candidatosJidRemitente(null, conn, [mOrJid])
  }

  if (!objetivos.length) return null

  for (const p of participants) {
    if (jidsSeSolapan(jidsParticipante(p, conn), objetivos)) return p
  }
  return null
}

export function obtenerBanderasAdminParticipante(participants, mOrJid, conn) {
  const user = buscarParticipanteGrupo(participants, mOrJid, conn) || {}
  const isRAdmin = user?.admin === 'superadmin'
  const isAdmin = isRAdmin || user?.admin === 'admin'
  return { user, isRAdmin: !!isRAdmin, isAdmin: !!isAdmin }
}

export function buscarParticipanteBot(participants, conn) {
  const idsBot = [
    conn?.user?.jid,
    conn?.user?.id,
    conn?.user?.lid,
    conn?.authState?.creds?.me?.id,
    conn?.authState?.creds?.me?.jid,
    conn?.authState?.creds?.me?.lid,
  ].filter(Boolean)
  return buscarParticipanteGrupo(participants, idsBot, conn)
}

export function esParticipanteBotAdmin(participants, conn) {
  const bot = buscarParticipanteBot(participants, conn)
  return !!(bot?.admin)
}

export function recolectarConexionesBot(preferredConn) {
  const lista = []
  const vistos = new Set()
  const agregar = (c) => {
    if (!c?.sendMessage) return
    const id = c.user?.jid || c.user?.id || c
    if (vistos.has(id)) return
    vistos.add(id)
    lista.push(c)
  }
  agregar(preferredConn)
  agregar(global.conn)
  if (Array.isArray(global.conns)) global.conns.forEach(agregar)
  return lista
}

/** Devuelve la conexion (bot principal o sub-bot) que sea admin en el grupo. */
export function buscarConnBotAdmin(participants, preferredConn) {
  for (const c of recolectarConexionesBot(preferredConn)) {
    if (esParticipanteBotAdmin(participants, c)) return c
  }
  return null
}

export {
  jidsParticipante as participantJids,
  candidatosJidRemitente as senderJidCandidates,
  jidsSeSolapan as jidsOverlap,
  resolverJidsObjetivo as resolveTargetJids,
  esRemitenteMuteado as isSenderMuted,
  quitarCoincidenciasMuteadas as removeMutedMatches,
  buscarParticipanteGrupo as findGroupParticipant,
  obtenerBanderasAdminParticipante as getParticipantAdminFlags,
  buscarParticipanteBot as findBotParticipant,
  esParticipanteBotAdmin as isBotParticipantAdmin,
  recolectarConexionesBot as collectBotConnections,
  buscarConnBotAdmin as findAdminBotConn
}
