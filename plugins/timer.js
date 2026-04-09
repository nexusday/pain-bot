const UNIT_MAP = {
  h: 3600_000,
  hr: 3600_000,
  hrs: 3600_000,
  hora: 3600_000,
  horas: 3600_000,
  m: 60_000,
  min: 60_000,
  mins: 60_000,
  minuto: 60_000,
  minutos: 60_000,
  s: 1000,
  seg: 1000,
  segundo: 1000,
  segundos: 1000,
}

function parseDurationMs(input) {
  if (!input) return 0
  let total = 0
  const rx = /(\d+)\s*(h|hr|hrs|hora|horas|m|min|mins|minuto|minutos|s|seg|segundo|segundos)\b/gi
  for (const match of input.matchAll(rx)) {
    const val = parseInt(match[1], 10)
    const unit = match[2].toLowerCase()
    const mult = UNIT_MAP[unit]
    if (mult) total += val * mult
  }
  return total
}

function stripDurations(text) {
  if (!text) return text
  return text
    .replace(/(\d+)\s*(h|hr|hrs|hora|horas|m|min|mins|minuto|minutos|s|seg|segundo|segundos)\b/gi, '')
    .replace(/[\/,|]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function formatMs(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const parts = []
  if (h) parts.push(`${h}h`)
  if (m) parts.push(`${m}m`)
  if (ss || parts.length === 0) parts.push(`${ss}s`)
  return parts.join(' ')
}

const handler = async (m, { conn, text, usedPrefix, command, groupMetadata }) => {
  try {
    if (!m.isGroup) return m.reply('Este comando solo funciona en grupos.')
    const cleaned = (text || '').trim()
    if (!cleaned) {
      return conn.reply(m.chat,
        `Uso: ${usedPrefix}${command} <mensaje> <tiempo>\n` +
        `Ejemplos:\n` +
        `- ${usedPrefix}${command} Vamos a jugar 25s\n` +
        `- ${usedPrefix}${command} Reunión 3m\n` +
        `- ${usedPrefix}${command} Evento 4h 30m\n` +
        `- ${usedPrefix}${command} Vamos hoy 3m / 25seg / 4h`,
        m
      )
    }

    const durationMs = parseDurationMs(cleaned)
    if (!durationMs || durationMs < 1000) {
      return conn.reply(m.chat, 'Debes indicar un tiempo válido. Ej: 25s, 3m, 1h 20m, 3m / 25seg / 4h', m)
    }

    
    const MAX_MS = 7 * 24 * 3600_000
    if (durationMs > MAX_MS) return conn.reply(m.chat, 'El tiempo máximo permitido es 7 días.', m)

    const msg = stripDurations(cleaned)
    if (!msg) return conn.reply(m.chat, 'Debes incluir un mensaje. Ej: "Vamos a jugar" 10m', m)

    const delayStr = formatMs(durationMs)
    const confirmText = `MENSAJE: ${msg}\n TIEMPO: ${delayStr}`
    await conn.sendMessage(m.chat, {
      text: confirmText,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) }
    }, { quoted: m })

    setTimeout(async () => {
      try {
      
        const meta = groupMetadata || (await conn.groupMetadata(m.chat).catch(() => null)) || { participants: [] }
        const participants = meta.participants || []
        const users = participants.map(u => conn.decodeJid(u.id))

        const finalText = (
          `${msg}`
        ).trim()

      
        try {
          const { generateWAMessageFromContent } = await import('@whiskeysockets/baileys')
          const built = generateWAMessageFromContent(
            m.chat,
            { extendedTextMessage: { text: finalText } },
            { quoted: null, userJid: conn.user.id }
          )
          const mod = conn.cMod(m.chat, built, finalText, conn.user.jid, { mentions: users })
          await conn.relayMessage(m.chat, mod.message, { messageId: mod.key?.id || undefined })
          return
        } catch {}

       
        const more = String.fromCharCode(8206)
        const masss = more.repeat(850)
        await conn.sendMessage(m.chat, { text: `${masss}\n${finalText}`, mentions: users, contextInfo: { ...(global.rcanal?.contextInfo || {}) } }, { quoted: null })
      } catch (err) {
        console.error('Error enviando temporizador:', err)
      }
    }, durationMs)

  } catch (e) {
    return conn.reply(m.chat, `⚠︎ Ocurrió un problema al crear el temporizador.\n${e?.message || e}`, m)
  }
}

handler.command = ['temp', 'timer']
handler.tags = ['grupo']
handler.group = true
handler.admin = true

export default handler
