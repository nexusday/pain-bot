import { sendBombaInvite } from '../lib/bomba-board.js'
import { resolveTargetJids } from '../lib/group-participant.js'
import {
  BOMBA_MIN_COINS,
  BOMBA_DEFAULT_BET,
  normalizeBet,
  canAffordBet,
} from '../lib/bomba-game.js'
import {
  resolveDbUser,
  isSamePlayer,
  formatBalance,
} from '../lib/michi-users.js'

function clearPendingInvite(chat, invite) {
  if (invite?.timeout) clearTimeout(invite.timeout)
  if (global.pendingInvites?.[chat]) delete global.pendingInvites[chat]
}

const BOMBA_MAX_BET = 10_000_000

function parseBet(args, text = '') {
  const candidates = []

  for (const a of args || []) {
    const raw = String(a).trim()
    if (!raw || raw.startsWith('@')) continue
    if (!/^\d+$/.test(raw)) continue
    candidates.push(parseInt(raw, 10))
  }

  if (!candidates.length && text) {
    const stripped = String(text)
      .replace(/@[\w\-\.~\d]+/g, ' ')
      .replace(/\s+/g, ' ')
    const nums = stripped.match(/\b(\d+)\b/g) || []
    for (const n of nums) candidates.push(parseInt(n, 10))
  }

  for (const n of candidates) {
    if (n >= BOMBA_MIN_COINS && n <= BOMBA_MAX_BET) return normalizeBet(n)
  }
  return BOMBA_DEFAULT_BET
}

let handler = async (m, { conn, args, usedPrefix, command, participants, text }) => {
  try {
    if (!m.isGroup) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Este comando solo funciona en grupos.',
        contextInfo: { ...rcanal.contextInfo },
      }, { quoted: m })
    }

    if (global.games?.[m.chat]) {
      return conn.sendMessage(m.chat, {
        text: '[❌] Ya hay un juego activo en este grupo.',
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
        text: `[❗] Menciona al rival y opcionalmente la apuesta.\nEjemplo: ${usedPrefix + command} @usuario 250\n${usedPrefix + command} 250 @usuario`,
        contextInfo: { ...rcanal.contextInfo },
      }, { quoted: m })
    }

    const groupParts = participants || []
    const bet = parseBet(args, text || m.text)
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
        text: '[❌] El usuario no esta registrado en el bot.',
        contextInfo: { ...rcanal.contextInfo },
      }, { quoted: m })
    }

    if (!canAffordBet(challengerData.jid, bet, conn, groupParts)) {
      return conn.sendMessage(m.chat, {
        text: `[❌] No tienes fondos para esta apuesta.\n> Tienes: ${formatBalance(challengerData.jid, conn, groupParts)}\n> Apuesta: ${bet} ${global.moneda}\n> Minimo: ${BOMBA_MIN_COINS} ${global.moneda}`,
        contextInfo: { ...rcanal.contextInfo },
      }, { quoted: m })
    }

    if (!canAffordBet(opponentData.jid, bet, conn, groupParts)) {
      return conn.sendMessage(m.chat, {
        text: `[❌] @${opponentData.jid.split('@')[0]} no tiene fondos.\n> Tiene: ${formatBalance(opponentData.jid, conn, groupParts)}\n> Apuesta: ${bet} ${global.moneda}`,
        contextInfo: { ...rcanal.contextInfo, mentionedJid: [opponentData.jid] },
      }, { quoted: m })
    }

    const challenger = challengerData.jid
    const opponent = opponentData.jid
    const pot = bet * 2

    if (!global.pendingInvites) global.pendingInvites = {}

    global.pendingInvites[m.chat] = {
      challenger,
      opponent,
      challengerJids: resolveTargetJids(challenger, groupParts, conn),
      opponentJids: resolveTargetJids(opponent, groupParts, conn),
      timestamp: Date.now(),
      timeout: null,
      type: 'bomba',
      bet,
    }

    global.pendingInvites[m.chat].timeout = setTimeout(() => {
      if (global.pendingInvites?.[m.chat]) {
        delete global.pendingInvites[m.chat]
        conn.sendMessage(m.chat, {
          text: `INVITACION EXPIRADA\n> @${opponent.split('@')[0]} no respondio.`,
          contextInfo: { ...rcanal.contextInfo, mentionedJid: [opponent] },
        })
      }
    }, 20000)

    const caption = `@${opponent.split('@')[0]} responde en *20 segundos*\n\nApuesta: *${bet}* ${global.moneda} c/u\nPremio: *${pot}* ${global.moneda}\n\n> *si* — Aceptar\n> *no* — Rechazar`

    return sendBombaInvite(conn, m.chat, {
      challenger,
      opponent,
      bet,
      participants: groupParts,
      quoted: m,
      caption,
      mentionedJid: [challenger, opponent],
    })
  } catch (e) {
    console.error('Error invitacion bomba:', e)
    return conn.sendMessage(m.chat, {
      text: '[❌] Error al enviar la invitacion.',
      contextInfo: { ...rcanal.contextInfo },
    }, { quoted: m })
  }
}

handler.help = ['bomba @usuario [apuesta]', 'bomba [apuesta] @usuario']
handler.tags = ['juegos', 'multijugador']
handler.command = ['bomba']
handler.group = true

export default handler
