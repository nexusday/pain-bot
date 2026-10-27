import { findGroupParticipant, jidsParticipante } from './group-participant.js'

function jidUsuario(valor, conn) {
  if (typeof valor !== 'string') return null
  let jid = valor.trim()
  try { jid = conn?.decodeJid?.(jid) || jid } catch {}
  if (typeof jid !== 'string' || !/^\d+(?::\d+)?@(?:s\.whatsapp\.net|c\.us|lid|hosted\.lid)$/i.test(jid)) return null
  const [numero, dominio] = jid.split('@')
  return `${numero.split(':')[0]}@${dominio === 'c.us' ? 's.whatsapp.net' : dominio}`
}

/** Mención explícita > autor citado. Nunca usar las menciones del mensaje citado. */
export function datosReaccion(m, conn, participants = []) {
  const ctx = m.msg?.contextInfo || {}
  const citado = m.quoted
  const menciones = m.mentionedJid
  const hayCita = !!(citado || ctx.stanzaId || ctx.quotedMessage)
  const candidatos = [
    ...(Array.isArray(menciones) ? menciones : []),
    ...(hayCita ? [citado?.sender, citado?.key?.participant, ctx.participant] : []),
  ]
  let objetivo = candidatos.map(jid => jidUsuario(jid, conn)).find(Boolean) || null
  const partes = participants?.length ? participants : conn?.chats?.[m.chat]?.metadata?.participants || []
  if (objetivo) {
    const participante = findGroupParticipant(partes, objetivo, conn)
    const ids = jidsParticipante(participante, conn).map(jid => jidUsuario(jid, conn)).filter(Boolean)
    objetivo = ids.find(jid => jid.endsWith('@s.whatsapp.net')) || objetivo
  }
  const remitente = jidUsuario(m.sender, conn) || String(m.sender || '')
  return {
    objetivo,
    mencion: [...new Set([remitente, objetivo].filter(Boolean))],
    etiquetaUsuario: `@${remitente.split('@')[0]}`,
    targetTag: objetivo ? `@${objetivo.split('@')[0]}` : '',
  }
}
