import { sendBombaBoard, sendBombaInvite, getBombaPlayerName } from './bomba-board.js'
import {
  BombaGame,
  BOMBA_MIN_COINS,
  BOMBA_DEFAULT_BET,
  normalizeBet,
  canAffordBet,
  deductFromUser,
  creditUser,
  isGamePlayer,
  isCurrentPlayer,
  parseBombaMove,
} from './bomba-game.js'
import { formatBalance } from './michi-users.js'

function clearPendingInvite(chat, invite) {
  if (invite?.timeout) clearTimeout(invite.timeout)
  if (global.pendingInvites?.[chat]) delete global.pendingInvites[chat]
}

async function lockBets(game) {
  const a = deductFromUser(game.player1, game.bet)
  const b = deductFromUser(game.player2, game.bet)
  if (a < game.bet || b < game.bet) {
    if (a > 0) creditUser(game.player1, a)
    if (b > 0) creditUser(game.player2, b)
    return false
  }
  try { await global.db.write() } catch {}
  return true
}

export async function acceptInvite(m, conn, invite, participants = []) {
  try {
    const groupParts = participants?.length
      ? participants
      : await conn.groupMetadata(m.chat).then(g => g.participants).catch(() => [])

    const challenger = invite.challenger
    const opponent = invite.opponent
    const bet = normalizeBet(invite.bet || BOMBA_DEFAULT_BET)

    if (!canAffordBet(challenger, bet, conn, groupParts)) {
      clearPendingInvite(m.chat, invite)
      return conn.sendMessage(m.chat, {
        text: `[❌] @${challenger.split('@')[0]} ya no tiene fondos.\n> Necesita: ${bet} ${global.moneda}`,
        contextInfo: { ...rcanal.contextInfo, mentionedJid: [challenger] },
      }, { quoted: m })
    }

    if (!canAffordBet(opponent, bet, conn, groupParts)) {
      clearPendingInvite(m.chat, invite)
      return conn.sendMessage(m.chat, {
        text: `[❌] No tienes fondos suficientes.\n> Tienes: ${formatBalance(opponent, conn, groupParts)}\n> Apuesta: ${bet} ${global.moneda}`,
        contextInfo: { ...rcanal.contextInfo, mentionedJid: [opponent] },
      }, { quoted: m })
    }

    if (global.games?.[m.chat]) {
      return conn.sendMessage(m.chat, {
        text: '[❌] Ya hay un juego activo en este grupo.',
        contextInfo: { ...rcanal.contextInfo },
      }, { quoted: m })
    }

    if (invite.timeout) clearTimeout(invite.timeout)
    delete global.pendingInvites[m.chat]

    const game = new BombaGame(challenger, opponent, m.chat, bet)
    if (!await lockBets(game)) {
      return conn.sendMessage(m.chat, {
        text: '[❌] No se pudieron reservar las apuestas. Intenta de nuevo.',
        contextInfo: { ...rcanal.contextInfo },
      }, { quoted: m })
    }

    game.conn = conn
    game.originalMessage = m

    game.onTimeout = async () => {
      try {
        if (!game.gameActive) return
        const inactive = game.currentPlayer
        game.gameActive = false
        game.winner = game.opponentOf(inactive)
        game.loser = inactive
        game.endReason = 'timeout'

        const simulatedM = { ...game.originalMessage }
        await handleGameEnd(simulatedM, conn, game, groupParts, null, { forcedEnd: true })
      } catch (e) {
        console.error('Error bomba timeout:', e)
      }
    }

    if (!global.games) global.games = {}
    global.games[m.chat] = {
      type: 'bomba',
      game,
      players: [challenger, opponent],
      startTime: Date.now(),
    }

    game.startInactivityTimeout()

    const turnName = getBombaPlayerName(game.currentPlayer, conn, groupParts)
    const caption = `BOMBA CALIENTE\nApuesta: ${bet} ${global.moneda} · Premio: ${game.pot} ${global.moneda}\n\nTurno de @${game.currentPlayer.split('@')[0]} (${turnName})\nUsa el boton para elegir casilla`

    return sendBombaBoard(conn, m.chat, game, {
      quoted: m,
      caption,
      mentionedJid: [game.currentPlayer],
      participants: groupParts,
      status: 'playing',
      interactive: true,
    })
  } catch (e) {
    console.error('Error aceptando bomba:', e)
  }
}

export async function rejectInvite(m, conn, invite) {
  try {
    clearPendingInvite(m.chat, invite)
    return conn.sendMessage(m.chat, {
      text: 'Invitacion a Bomba Caliente rechazada.',
      contextInfo: { ...rcanal.contextInfo },
    }, { quoted: m })
  } catch (e) {
    console.error('Error rejectInvite bomba:', e)
  }
}

export async function handleMove(m, conn, gameData, participants = []) {
  try {
    const game = gameData.game
    if (!game?.gameActive) return false

    const groupParts = participants?.length
      ? participants
      : await conn.groupMetadata(m.chat).then(g => g.participants).catch(() => [])

    if (!isGamePlayer(m, game, conn, groupParts)) return false

    const cellIndex = parseBombaMove(m)
    if (cellIndex === null) return false

    if (!isCurrentPlayer(m, game, conn, groupParts)) {
      await conn.sendMessage(m.chat, {
        text: 'No es tu turno. Espera a que el otro jugador elija.',
        contextInfo: { ...rcanal.contextInfo },
      }, { quoted: m })
      return true
    }

    const res = game.openCell(cellIndex, game.currentPlayer)
    if (!res.ok) {
      if (res.reason === 'already') {
        await conn.sendMessage(m.chat, {
          text: 'Esa casilla ya fue abierta.',
          contextInfo: { ...rcanal.contextInfo },
        }, { quoted: m })
      }
      return true
    }

    if (!game.gameActive || res.hit || res.forcedEnd) {
      return handleGameEnd(m, conn, game, groupParts, cellIndex, res)
    }

    const nextPlayer = game.currentPlayer
    const nextName = getBombaPlayerName(nextPlayer, conn, groupParts)
    const caption = `@${m.sender.split('@')[0]} abrio casilla ${cellIndex + 1} — SEGURO\n\nTurno de @${nextPlayer.split('@')[0]} (${nextName})`

    await sendBombaBoard(conn, m.chat, game, {
      quoted: m,
      caption,
      mentionedJid: [m.sender, nextPlayer],
      participants: groupParts,
      status: 'playing',
      highlightIndex: cellIndex,
      interactive: true,
    })
    return true
  } catch (e) {
    console.error('Error handleMove bomba:', e)
    return false
  }
}

export async function handleGameEnd(m, conn, game, participants = [], highlightIndex = null, lastRes = null) {
  try {
    const chatId = game.chatId || m.chat
    const groupParts = participants?.length
      ? participants
      : await conn.groupMetadata(chatId).then(g => g.participants).catch(() => [])

    game.clearTimeout?.()
    game.onTimeout = null
    if (global.games?.[chatId]) delete global.games[chatId]

    const winner = game.winner
    const loser = game.loser
    const moneda = global.moneda || 'USD'

    if (winner) creditUser(winner, game.pot)
    try { await global.db.write() } catch {}

    const wName = getBombaPlayerName(winner, conn, groupParts)
    const lName = getBombaPlayerName(loser, conn, groupParts)

    let reason = ''
    if (game.endReason === 'ultima_casilla') {
      reason = `\nQuedo 1 casilla: @${loser.split('@')[0]} debia abrirla y perdio.`
    } else if (game.endReason === 'bomba') {
      reason = `\n@${loser.split('@')[0]} exploto la bomba.`
    } else if (game.endReason === 'timeout') {
      reason = `\n@${loser.split('@')[0]} no jugo a tiempo.`
    }

    const caption = `BOMBA CALIENTE — FIN\n\nGanador: @${winner.split('@')[0]} (${wName})\n+${game.pot} ${moneda}\nPerdedor: @${loser.split('@')[0]} (${lName})\n-${game.bet} ${moneda}${reason}`

    return sendBombaBoard(conn, chatId, game, {
      quoted: m,
      caption,
      mentionedJid: [winner, loser],
      participants: groupParts,
      status: 'finished',
      winnerJid: winner,
      highlightIndex,
      revealAll: true,
      interactive: false,
    })
  } catch (e) {
    console.error('Error handleGameEnd bomba:', e)
  }
}

export { parseBombaMove }
