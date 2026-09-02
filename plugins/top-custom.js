function parseTopInput(text) {
  const raw = String(text || '').trim()
  if (!raw) return null

  const pipeIndex = raw.indexOf('|')
  const name = (pipeIndex === -1 ? raw : raw.slice(0, pipeIndex)).trim()
  const emoji = pipeIndex === -1 ? '' : raw.slice(pipeIndex + 1).trim()

  if (!name || name.length > 40) return null

  return {
    name,
    emoji: emoji || null,
  }
}

function pickRandomParticipants(participants, botJid, limit = 10) {
  const pool = participants.filter(p => p.id && p.id !== botJid)
  const selected = []
  const maxUsers = Math.min(limit, pool.length)

  for (let i = 0; i < maxUsers; i++) {
    const user = pool[Math.floor(Math.random() * pool.length)]
    if (!selected.find(u => u.id === user.id)) {
      selected.push(user)
    } else {
      i--
    }
  }

  return selected
}

function lineEmoji(position, customEmoji) {
  if (customEmoji) return customEmoji
  if (position === 1) return '🥇'
  if (position === 2) return '🥈'
  if (position === 3) return '🥉'
  return '⭐'
}

let handler = async (m, { conn, text, usedPrefix }) => {
  if (!m.isGroup) {
    return conn.sendMessage(m.chat, {
      text: '[❗] Este comando solo puede usarse en grupos.',
      contextInfo: { ...rcanal.contextInfo },
    }, { quoted: m })
  }

  const parsed = parseTopInput(text)
  if (!parsed) {
    return conn.sendMessage(m.chat, {
      text: `𓍯 𝚃𝙾𝙿 𝙿𝙴𝚁𝚂𝙾𝙽𝙰𝙻𝙸𝚉𝙰𝙳𝙾 𓍯

> 𓂃 ࣪ ִֶָ☾.  *${usedPrefix}top <nombre>|emoji*

> 𓂃 ࣪ ִֶָ☾.  *${usedPrefix}top coneros*
> 𓂃 ࣪ ִֶָ☾.  *${usedPrefix}top coneros|🪙*

⊹ Muestra 10 miembros del grupo ⊹`,
      contextInfo: { ...rcanal.contextInfo },
    }, { quoted: m })
  }

  try {
    const groupMetadata = await conn.groupMetadata(m.chat)
    const participants = groupMetadata.participants || []
    const botJid = conn.decodeJid(conn.user?.jid || conn.user?.id)
    const selectedUsers = pickRandomParticipants(participants, botJid, 10)

    if (selectedUsers.length === 0) {
      return conn.sendMessage(m.chat, {
        text: '[❗] No hay suficientes usuarios en el grupo para crear el top.',
        contextInfo: { ...rcanal.contextInfo },
      }, { quoted: m })
    }

    const title = parsed.name.toUpperCase()
    let txt = `   𓍯  TOP ${title}  𓍯\n\n`

    selectedUsers.forEach((user, index) => {
      const position = index + 1
      const emoji = lineEmoji(position, parsed.emoji)
      txt += `${emoji} @${user.id.split('@')[0]}\n`
    })

    return conn.sendMessage(m.chat, {
      text: txt,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: selectedUsers.map(user => user.id),
      },
    }, { quoted: m })
  } catch (e) {
    console.error('Error en top personalizado:', e)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error al generar el top.',
      contextInfo: { ...rcanal.contextInfo },
    }, { quoted: m })
  }
}

handler.help = ['top <nombre>|emoji']
handler.tags = ['fun', 'grupos']
handler.command = ['top']
handler.group = true

export default handler
