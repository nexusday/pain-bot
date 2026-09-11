function parsearEntradaTop(text) {
  const crudo = String(text || '').trim()
  if (!crudo) return null

  const indicePipe = crudo.indexOf('|')
  const name = (indicePipe === -1 ? crudo : crudo.slice(0, indicePipe)).trim()
  const emoji = indicePipe === -1 ? '' : crudo.slice(indicePipe + 1).trim()

  if (!name || name.length > 40) return null

  return {
    name,
    emoji: emoji || null,
  }
}

function pickRandomParticipants(participants, botJid, limite = 10) {
  const pool = participants.filter(p => p.id && p.id !== botJid)
  const selected = []
  const maxUsuarios = Math.min(limite, pool.length)

  for (let i = 0; i < maxUsuarios; i++) {
    const usuario = pool[Math.floor(Math.random() * pool.length)]
    if (!selected.find(u => u.id === usuario.id)) {
      selected.push(usuario)
    } else {
      i--
    }
  }

  return selected
}

function lineEmoji(posicion, customEmoji) {
  if (customEmoji) return customEmoji
  if (posicion === 1) return '🥇'
  if (posicion === 2) return '🥈'
  if (posicion === 3) return '🥉'
  return '⭐'
}

let handler = async (m, { conn, text, usedPrefix }) => {
  if (!m.isGroup) {
    return conn.sendMessage(m.chat, {
      text: '[❗] Este comando solo puede usarse en grupos.',
      contextInfo: { ...rcanal.contextInfo },
    }, { quoted: m })
  }

  const parsed = parsearEntradaTop(text)
  if (!parsed) {
    return conn.sendMessage(m.chat, {
      text: `𓍯 𝚃𝙾𝙿 𝙿𝙴𝚁𝚂𝙾𝙽𝙰𝙻𝙸𝚉𝙰𝙳𝙾 𓍯

> 𓂃 ࣪ ִֶָ☾.  *${usedPrefix}top <nombre>|emoji*

> 𓂃 ࣪ ִֶָ☾.  *${usedPrefix}top coneros*
> 𓂃 ࣪ ִֶָ☾.  *${usedPrefix}top coneros|🪙*
> 𓂃 ࣪ ִֶָ☾.  *${usedPrefix}top los mas malos|😈*

⊹ Muestra 10 miembros del grupo ⊹`,
      contextInfo: { ...rcanal.contextInfo },
    }, { quoted: m })
  }

  try {
    const metadatosGrupo = await conn.groupMetadata(m.chat)
    const participants = metadatosGrupo.participants || []
    const botJid = conn.decodeJid(conn.user?.jid || conn.user?.id)
    const usuariosSeleccionados = pickRandomParticipants(participants, botJid, 10)

    if (usuariosSeleccionados.length === 0) {
      return conn.sendMessage(m.chat, {
        text: '[❗] No hay suficientes usuarios en el grupo para crear el top.',
        contextInfo: { ...rcanal.contextInfo },
      }, { quoted: m })
    }

    const title = parsed.name.toUpperCase()
    let texto = `   𓍯  TOP ${title}  𓍯\n\n`

    usuariosSeleccionados.forEach((usuario, indice) => {
      const posicion = indice + 1
      const emoji = lineEmoji(posicion, parsed.emoji)
      texto += `${emoji} @${usuario.id.split('@')[0]}\n`
    })

    return conn.sendMessage(m.chat, {
      text: texto,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: usuariosSeleccionados.map(usuario => usuario.id),
      },
    }, { quoted: m })
  } catch (error) {
    console.error('Error en top personalizado:', error)
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
