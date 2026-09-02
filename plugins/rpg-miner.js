import { sendMinerInvite } from '../lib/miner-board.js'
import { resolveTargetJids } from '../lib/group-participant.js'
import {
  MINER_MIN_COINS,
  resolveDbUser,
  canPlayMiner,
  isSamePlayer,
  formatBalance,
} from '../lib/michi-users.js'

function clearPendingInvite(chat, invite) {
  if (invite?.timeout) clearTimeout(invite.timeout)
  if (global.pendingInvites?.[chat]) delete global.pendingInvites[chat]
}

let handler = async (m, { conn, args, usedPrefix, command, participants }) => {
  try {
    if (!m.isGroup) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Este comando solo puede ser usado en grupos.',
        contextInfo: { ...rcanal.contextInfo },
      }, { quoted: m })
    }

    if (global.games?.[m.chat]?.type === 'miner') {
      return conn.sendMessage(m.chat, {
        text: '[❌] Ya hay un juego de Miner activo en este grupo.',
        contextInfo: { ...rcanal.contextInfo },
      }, { quoted: m })
    }

    if (global.pendingInvites?.[m.chat]) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Ya hay una invitacion pendiente en este grupo.',
        contextInfo: { ...rcanal.contextInfo },
      }, { quoted: m })
    }

    if (!m.mentionedJid?.length) {
      return conn.sendMessage(m.chat, {
        text: `[❗] Debes mencionar al jugador a retar.\nEjemplo: ${usedPrefix + command} @usuario`,
        contextInfo: { ...rcanal.contextInfo },
      }, { quoted: m })
    }

    const groupParts = participants || []
    const opponentRaw = m.mentionedJid[0]
    const challengerData = resolveDbUser(m.sender, conn, groupParts)
    const opponentData = resolveDbUser(opponentRaw, conn, groupParts)

    if (isSamePlayer(opponentRaw, m.sender, conn, groupParts)) {
      return conn.sendMessage(m.chat, {
        text: '[❌] No puedes retarte a ti mismo.',
        contextInfo: { ...rcanal.contextInfo },
      }, { quoted: m })
    }

    if (isSamePlayer(opponentRaw, conn.user?.jid || conn.user?.id, conn, groupParts)) {
      return conn.sendMessage(m.chat, {
        text: '[❌] No puedes jugar contra el bot.',
        contextInfo: { ...rcanal.contextInfo },
      }, { quoted: m })
    }

    if (!opponentData.user) {
      return conn.sendMessage(m.chat, {
        text: '[❌] El usuario mencionado no esta registrado en el bot.',
        contextInfo: { ...rcanal.contextInfo },
      }, { quoted: m })
    }

    if (!canPlayMiner(challengerData.jid, conn, groupParts)) {
      return conn.sendMessage(m.chat, {
        text: `[❌] No tienes suficientes fondos para Miner.\n> Tienes: ${formatBalance(challengerData.jid, conn, groupParts)}\n> Minimo: ${MINER_MIN_COINS} ${global.moneda}`,
        contextInfo: { ...rcanal.contextInfo },
      }, { quoted: m })
    }

    if (!canPlayMiner(opponentData.jid, conn, groupParts)) {
      return conn.sendMessage(m.chat, {
        text: `[❌] @${opponentData.jid.split('@')[0]} no tiene fondos suficientes para Miner.\n> Tiene: ${formatBalance(opponentData.jid, conn, groupParts)}\n> Minimo: ${MINER_MIN_COINS} ${global.moneda}`,
        contextInfo: { ...rcanal.contextInfo, mentionedJid: [opponentData.jid] },
      }, { quoted: m })
    }

    const challenger = challengerData.jid
    const opponent = opponentData.jid

    if (!global.pendingInvites) global.pendingInvites = {}

    global.pendingInvites[m.chat] = {
      challenger,
      opponent,
      challengerJids: resolveTargetJids(challenger, groupParts, conn),
      opponentJids: resolveTargetJids(opponent, groupParts, conn),
      timestamp: Date.now(),
      timeout: null,
      type: 'miner',
      penaltyRange: [50, 150],
    }

    global.pendingInvites[m.chat].timeout = setTimeout(() => {
      if (global.pendingInvites?.[m.chat]) {
        delete global.pendingInvites[m.chat]
        conn.sendMessage(m.chat, {
          text: `INVITACION EXPIRADA\n> @${opponent.split('@')[0]} no respondio a tiempo.`,
          contextInfo: { ...rcanal.contextInfo, mentionedJid: [opponent] },
        })
      }
    }, 20000)

    const caption = `@${opponent.split('@')[0]} responde en *20 segundos*\n\n> *si* — Aceptar\n> *no* — Rechazar`

    return sendMinerInvite(conn, m.chat, {
      challenger,
      opponent,
      participants: groupParts,
      quoted: m,
      caption,
      mentionedJid: [challenger, opponent],
    })
  } catch (e) {
    console.error('Error invitacion miner:', e)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrio un error al enviar la invitacion.',
      contextInfo: { ...rcanal.contextInfo },
    }, { quoted: m })
  }
}

handler.help = ['miner @usuario']
handler.tags = ['juegos', 'multijugador']
handler.command = ['miner']
handler.group = true

export default handler

