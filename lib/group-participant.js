/**
 * Empareja sender ↔ participante de grupo con Baileys (LID + PN).
 
 */

function decodeMaybe(conn, jid) {
  if (!jid) return ''
  try {
    return conn?.decodeJid?.(jid) || String(jid)
  } catch {
    return String(jid)
  }
}

function userDigits(jid = '') {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '')
}

function asLidJid(value) {
  if (!value) return ''
  const s = String(value)
  if (s.includes('@')) return s
  return `${s.replace(/\D/g, '')}@lid`
}

function asPnJid(value) {
  if (!value) return ''
  const s = String(value)
  if (s.includes('@')) return s
  const digits = s.replace(/\D/g, '')
  return digits ? `${digits}@s.whatsapp.net` : ''
}


export function participantJids(p, conn) {
  if (!p) return []
  const list = [
    p.id,
    p.jid,
    p.lid ? asLidJid(p.lid) : '',
    p.phoneNumber ? asPnJid(p.phoneNumber) : '',
  ]
    .filter(Boolean)
    .map(j => decodeMaybe(conn, j))
  return [...new Set(list.filter(Boolean))]
}


export function senderJidCandidates(m, conn, extra = []) {
  if (!m && !extra.length) return []

  const fromMsg = m
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

  const list = [...fromMsg, ...extra]
    .filter(Boolean)
    .map(j => decodeMaybe(conn, j))

  return [...new Set(list.filter(Boolean))]
}

function jidsOverlap(aList, bList) {
  const setA = new Set(aList.map(String))
  for (const b of bList) {
    if (setA.has(String(b))) return true
  }

  const digitsA = new Set(aList.map(userDigits).filter(d => d.length >= 6))
  for (const b of bList) {
    const d = userDigits(b)
    if (d.length >= 6 && digitsA.has(d)) return true
  }
  return false
}

/**
 * Busca el participante que corresponde al mensaje / jid.
 * @param {Array} participants
 * @param {object|string|string[]} mOrJid - mensaje, jid, o lista de jids
 * @param {object} conn
 */
export function findGroupParticipant(participants, mOrJid, conn) {
  if (!Array.isArray(participants) || !participants.length) return null

  let targets = []
  if (mOrJid && typeof mOrJid === 'object' && !Array.isArray(mOrJid) && (mOrJid.key || mOrJid.sender)) {
    targets = senderJidCandidates(mOrJid, conn)
  } else if (Array.isArray(mOrJid)) {
    targets = senderJidCandidates(null, conn, mOrJid)
  } else if (mOrJid) {
    targets = senderJidCandidates(null, conn, [mOrJid])
  }

  if (!targets.length) return null

  for (const p of participants) {
    if (jidsOverlap(participantJids(p, conn), targets)) return p
  }
  return null
}

export function getParticipantAdminFlags(participants, mOrJid, conn) {
  const user = findGroupParticipant(participants, mOrJid, conn) || {}
  const isRAdmin = user?.admin === 'superadmin'
  const isAdmin = isRAdmin || user?.admin === 'admin'
  return { user, isRAdmin: !!isRAdmin, isAdmin: !!isAdmin }
}

export function findBotParticipant(participants, conn) {
  const botIds = [
    conn?.user?.jid,
    conn?.user?.id,
    conn?.user?.lid,
    conn?.authState?.creds?.me?.id,
    conn?.authState?.creds?.me?.jid,
    conn?.authState?.creds?.me?.lid,
  ].filter(Boolean)
  return findGroupParticipant(participants, botIds, conn)
}
