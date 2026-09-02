/**
 * Sistema Anti-Palabra
 * Detecta palabras prohibidas configuradas por grupo y aplica acción.
 */

function foldMathAlpha(str) {
  return String(str || '')
    .replace(/[\u{1D400}-\u{1D419}]/gu, c => String.fromCharCode(c.codePointAt(0) - 0x1D400 + 65))
    .replace(/[\u{1D41A}-\u{1D433}]/gu, c => String.fromCharCode(c.codePointAt(0) - 0x1D41A + 97))
    .replace(/[\u{1D5D4}-\u{1D5ED}]/gu, c => String.fromCharCode(c.codePointAt(0) - 0x1D5D4 + 65))
    .replace(/[\u{1D5EE}-\u{1D607}]/gu, c => String.fromCharCode(c.codePointAt(0) - 0x1D5EE + 97))
    .replace(/[\u{1D7EC}-\u{1D7F5}]/gu, c => String.fromCharCode(c.codePointAt(0) - 0x1D7EC + 48))
    .replace(/[\u{FF10}-\u{FF19}]/gu, c => String.fromCharCode(c.codePointAt(0) - 0xFF10 + 48))
    .replace(/[\u{FF21}-\u{FF3A}]/gu, c => String.fromCharCode(c.codePointAt(0) - 0xFF21 + 65))
    .replace(/[\u{FF41}-\u{FF5A}]/gu, c => String.fromCharCode(c.codePointAt(0) - 0xFF41 + 97))
}

export function normalizeAntiText(text) {
  return foldMathAlpha(text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñáéíóúü\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function sanitizeAntiPalabraWords(words) {
  if (!Array.isArray(words)) return []
  const seen = new Set()
  const out = []
  for (const raw of words) {
    let n = normalizeAntiText(raw)
    if (n.startsWith('add ') && n.includes(' ')) n = n.slice(4).trim()
    if (!n || seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}

export function ensureAntiPalabraStore() {
  if (!global.db) global.db = { data: {} }
  if (!global.db.data) global.db.data = {}
  if (!global.db.data.antiPalabra || typeof global.db.data.antiPalabra !== 'object') {
    global.db.data.antiPalabra = {}
  }
  return global.db.data.antiPalabra
}

export function getAntiPalabraConfig(chat) {
  const store = ensureAntiPalabraStore()
  if (!chat || !store[chat]) return null
  const cfg = store[chat]
  const clean = sanitizeAntiPalabraWords(cfg.words)
  if (JSON.stringify(clean) !== JSON.stringify(cfg.words || [])) {
    cfg.words = clean
    global.db.write?.().catch(() => {})
  }
  return cfg
}

function getInspectableText(m) {
  const parts = [
    m?.text,
    m?.msg?.text,
    m?.msg?.caption,
    m?.msg?.contentText,
    m?.msg?.conversation,
  ]
  return parts
    .filter(v => typeof v === 'string' && v.trim())
    .join(' ')
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

    const cfg = getAntiPalabraConfig(m.chat)
    if (!cfg || !cfg.enabled) return

    const text = getInspectableText(m)
    if (!text) return
    if (isBotCommand(text)) return

    const words = sanitizeAntiPalabraWords(cfg.words)
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
