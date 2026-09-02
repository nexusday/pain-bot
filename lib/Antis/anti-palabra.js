/**
 * Sistema Anti-Palabra
 * Detecta palabras prohibidas configuradas por grupo y aplica acción.
 */

export function normalizeAntiText(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñáéíóúü\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function messageContainsBannedWord(text, word) {
  const hay = normalizeAntiText(text)
  const needle = normalizeAntiText(word)
  if (!needle || !hay) return false

 
  if (hay.includes(needle)) return true

  
  if (needle.includes(' ')) {
    const parts = needle.split(' ').filter(Boolean)
    if (parts.length > 1) {
      let pos = 0
      for (const part of parts) {
        const idx = hay.indexOf(part, pos)
        if (idx === -1) return false
        pos = idx + part.length
      }
      return true
    }
  }

  return false
}

function isBotCommand(text) {
  const str2Regex = str => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
  const prefixes = Array.isArray(global.prefix) ? global.prefix : [global.prefix]
  return prefixes.some(p => {
    if (p instanceof RegExp) return p.test(text)
    if (typeof p === 'string') return new RegExp(str2Regex(p)).test(text)
    return false
  })
}

export async function handleAntiPalabra(m, conn, isAdmin, rcanal) {
  try {
    if (!m.isGroup) return
    if (!global.db?.data?.antiPalabra?.[m.chat]) return

    const cfg = global.db.data.antiPalabra[m.chat]
    if (!cfg || cfg.enabled !== true) return

    const text = (m.text || '').toString()
    if (!text) return
    if (isBotCommand(text)) return

    const words = Array.isArray(cfg.words) ? cfg.words : []
    if (words.length === 0) return

    const found = words.some(word => messageContainsBannedWord(text, word))
    if (!found) return

    const action = cfg.action || 'delete'
    let deleted = false

    try {
      await conn.sendMessage(m.chat, { delete: m.key })
      deleted = true
    } catch (e) {
      console.error('anti-palabra delete error:', e?.message || e)
    }

    if (action === 'kick') {
      await conn.sendMessage(m.chat, {
        text: `@${m.sender.split('@')[0]} usó una palabra prohibida y será expulsado.`,
        contextInfo: { ...rcanal.contextInfo, mentionedJid: [m.sender] },
      }, { quoted: m }).catch(() => {})
      await conn.groupParticipantsUpdate(m.chat, [m.sender], 'remove').catch(() => {})
    } else if (deleted) {
      await conn.sendMessage(m.chat, {
        text: `@${m.sender.split('@')[0]} mensaje eliminado por palabra prohibida.`,
        contextInfo: { ...rcanal.contextInfo, mentionedJid: [m.sender] },
      }, { quoted: m }).catch(() => {})
    } else {
      await conn.sendMessage(m.chat, {
        text: `@${m.sender.split('@')[0]} usó una palabra prohibida. El bot debe ser *admin* para borrar mensajes.`,
        contextInfo: { ...rcanal.contextInfo, mentionedJid: [m.sender] },
      }, { quoted: m }).catch(() => {})
    }

    return true
  } catch (e) {
    console.error('handleAntiPalabra error:', e)
    return false
  }
}
