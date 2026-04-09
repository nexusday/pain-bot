let handler = async (m, { conn, args, usedPrefix, command }) => {
  try {
    if (!m.isGroup) {
      return conn.sendMessage(m.chat, { text: '[❗] Este comando solo puede ser usado en grupos.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
    }

    if (!m.mentionedJid || m.mentionedJid.length === 0) {
      return conn.sendMessage(m.chat, { text: `[❗] Debes mencionar al jugador a retar.\nEjemplo: ${usedPrefix + command} @usuario`, contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
    }

    const opponent = m.mentionedJid[0]
    if (opponent === m.sender) {
      return conn.sendMessage(m.chat, { text: '[❌] No puedes retarte a ti mismo.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
    }

    if (opponent === conn.user.jid) {
      return conn.sendMessage(m.chat, { text: '[❌] No puedes jugar contra el bot.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
    }

    
    const challengerUser = global.db.data.users[m.sender] || {}
    const opponentUser = global.db.data.users[opponent] || {}
    const challengerTotal = (challengerUser.coins || 0) + (challengerUser.bancoDinero || 0)
    const opponentTotal = (opponentUser.coins || 0) + (opponentUser.bancoDinero || 0)

    if (challengerTotal < 450) {
      return conn.sendMessage(m.chat, { text: '[❌] No tienes suficientes USD para iniciar Miner. Necesitas al menos 450.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
    }

    if (opponentTotal < 450) {
      return conn.sendMessage(m.chat, { text: `[@${opponent.split('@')[0]}] no tiene al menos 450 para jugar Miner.`, contextInfo: { ...rcanal.contextInfo, mentionedJid: [opponent] } }, { quoted: m })
    }

    if (!global.pendingInvites) global.pendingInvites = {}

    
    global.pendingInvites[m.chat] = {
      challenger: m.sender,
      opponent: opponent,
      timestamp: Date.now(),
      timeout: null,
      type: 'miner',
      penaltyRange: [50, 150]
    }

    global.pendingInvites[m.chat].timeout = setTimeout(() => {
      if (global.pendingInvites && global.pendingInvites[m.chat]) {
        delete global.pendingInvites[m.chat]
        conn.sendMessage(m.chat, { text: `INVITACION EXPIRADA\n> @${opponent.split('@')[0]} no respondió a tiempo.`, contextInfo: { ...rcanal.contextInfo, mentionedJid: [opponent] } })
      }
    }, 20000)

    const message = `𓍯  INVITACIÓN A MINER  𓍯\n  @${opponent.split('@')[0]} — el integrante @${m.sender.split('@')[0]} te invita a una partida.\n  Responde 'si' para aceptar o 'no' para rechazar en 20s\n`.trim()

    return conn.sendMessage(m.chat, { text: message, contextInfo: { ...rcanal.contextInfo, mentionedJid: [m.sender, opponent] } }, { quoted: m })

  } catch (e) {
    console.error('Error invitación miner:', e)
    return conn.sendMessage(m.chat, { text: '[❌] Ocurrió un error al enviar la invitación.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
  }
}

handler.help = ['miner @usuario']
handler.tags = ['juegos', 'multijugador']
handler.command = ['miner']
handler.group = true

export default handler
