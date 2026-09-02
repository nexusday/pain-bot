import {
  sendMinerBoard,
  getMinerPlayerName,
  getMinerWinner,
} from './miner-board.js'
import {
  MINER_MIN_COINS,
  canPlayMiner,
  formatBalance,
} from './michi-users.js'

class MinerGame {
  constructor(player1, player2, chatId) {
    this.player1 = player1
    this.player2 = player2
    this.chatId = chatId
    this.currentPlayer = player1
    this.cells = Array.from({ length: 10 }, () => ({ opened: false }))
    this.openedCount = 0
    this.summary = {}
    this.summary[player1] = { gained: 0 }
    this.summary[player2] = { gained: 0 }
    this.gameActive = true
    this.timeout = null
    this.onTimeout = null
    this.startTime = Date.now()
    this.lastMove = Date.now()
    this.moves = 0
  }

  isPlayer(player) {
    return player === this.player1 || player === this.player2
  }

  openCell(index, player) {
    if (index < 0 || index >= this.cells.length) return { ok: false, reason: 'invalid' }
    const cell = this.cells[index]
    if (cell.opened) return { ok: false, reason: 'already' }

    const rand = Math.random()
    let result = { type: 'gain', amount: 0, text: '' }

    if (rand < 0.4) {
      const amt = Math.floor(Math.random() * (500 - 100 + 1)) + 100
      result.type = 'gain'
      result.amount = amt
      result.text = `ENCONTRASTE +${amt} USD`
    } else {
      const amt = Math.floor(Math.random() * (150 - 50 + 1)) + 50
      result.type = 'lose'
      result.amount = amt
      result.text = `PERDISTE -${amt} USD`
    }

    cell.opened = true
    cell.result = result
    this.openedCount += 1
    this.moves++
    this.lastMove = Date.now()

    if (result.type === 'gain' || result.type === 'big') {
      global.db.data.users[player] = global.db.data.users[player] || {}
      global.db.data.users[player].coins = (global.db.data.users[player].coins || 0) + result.amount
      this.summary[player].gained += result.amount
    } else if (result.type === 'lose') {
      global.db.data.users[player] = global.db.data.users[player] || {}
      const user = global.db.data.users[player]
      const wallet = user.coins || 0
      const bank = user.bancoDinero || 0
      const total = wallet + bank
      const loss = Math.min(total, result.amount)

      let remaining = loss
      const fromWallet = Math.min(wallet, remaining)
      user.coins = wallet - fromWallet
      remaining -= fromWallet
      if (remaining > 0) {
        user.bancoDinero = Math.max(0, bank - remaining)
      }
      this.summary[player].gained -= loss
      result.amount = loss
    }

    this.currentPlayer = player === this.player1 ? this.player2 : this.player1

    if (this.onTimeout) this.startInactivityTimeout()

    return { ok: true, result, index }
  }

  isFinished() {
    return this.openedCount >= this.cells.length
  }

  cancelGame(reason = 'inactividad') {
    this.gameActive = false
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }
    return {
      cancelled: true,
      reason,
      player1: this.player1,
      player2: this.player2,
      players: [this.player1, this.player2],
      chatId: this.chatId,
      currentPlayer: this.currentPlayer,
      summary: this.summary,
    }
  }

  startInactivityTimeout() {
    if (this.timeout) clearTimeout(this.timeout)
    if (!this.onTimeout) return

    this.timeout = setTimeout(async () => {
      if (this.gameActive) await this.onTimeout(this.cancelGame('inactividad'))
    }, 60000)
  }

  clearTimeout() {
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }
  }
}

function clearPendingInvite(chat, invite) {
  if (invite?.timeout) clearTimeout(invite.timeout)
  if (global.pendingInvites?.[chat]) delete global.pendingInvites[chat]
}

export async function acceptInvite(m, conn, invite, participants = []) {
  try {
    const groupParts = participants?.length
      ? participants
      : await conn.groupMetadata(m.chat).then(g => g.participants).catch(() => [])

    const challenger = invite.challenger
    const opponent = invite.opponent

    if (!canPlayMiner(challenger, conn, groupParts)) {
      clearPendingInvite(m.chat, invite)
      return conn.sendMessage(m.chat, {
        text: `[❌] @${challenger.split('@')[0]} ya no tiene fondos suficientes.\n> Minimo: ${MINER_MIN_COINS} ${global.moneda}`,
        contextInfo: { ...rcanal.contextInfo, mentionedJid: [challenger] },
      }, { quoted: m })
    }

    if (!canPlayMiner(opponent, conn, groupParts)) {
      clearPendingInvite(m.chat, invite)
      return conn.sendMessage(m.chat, {
        text: `[❌] No tienes fondos suficientes para jugar Miner.\n> Tienes: ${formatBalance(opponent, conn, groupParts)}\n> Minimo: ${MINER_MIN_COINS} ${global.moneda}`,
        contextInfo: { ...rcanal.contextInfo, mentionedJid: [opponent] },
      }, { quoted: m })
    }

    if (global.games?.[m.chat]) {
      return conn.sendMessage(m.chat, {
        text: '[❌] Ya hay un juego de Miner activo en este grupo.',
        contextInfo: { ...rcanal.contextInfo },
      }, { quoted: m })
    }

    if (invite.timeout) clearTimeout(invite.timeout)
    delete global.pendingInvites[m.chat]

    const game = new MinerGame(challenger, opponent, m.chat)
    game.conn = conn
    game.originalMessage = m
    game.penaltyRange = invite.penaltyRange || [50, 150]

    game.onTimeout = async (cancelledGame) => {
      try {
        const inactivePlayer = cancelledGame.currentPlayer
        const penalty = 150
        if (global.db.data.users[inactivePlayer]) {
          const user = global.db.data.users[inactivePlayer]
          const wallet = user.coins || 0
          const bank = user.bancoDinero || 0
          const total = wallet + bank
          const loss = Math.min(total, penalty)
          let remaining = loss
          const fromWallet = Math.min(wallet, remaining)
          user.coins = wallet - fromWallet
          remaining -= fromWallet
          if (remaining > 0) user.bancoDinero = Math.max(0, bank - remaining)

          await conn.sendMessage(m.chat, {
            text: `Timeout: @${inactivePlayer.split('@')[0]} no respondio y fue penalizado -${loss} ${global.moneda}`,
            contextInfo: { ...rcanal.contextInfo, mentionedJid: [inactivePlayer] },
          }).catch(() => {})
        }

        const simulatedM = { ...game.originalMessage }
        simulatedM.sender = 'system@timeout'
        simulatedM.fromMe = false
        simulatedM.key = { ...(simulatedM.key || {}), fromMe: false, id: 'timeout-' + Date.now() }
        await handleGameEnd(simulatedM, conn, cancelledGame, groupParts)
      } catch (e) {
        console.error('Error in miner onTimeout:', e)
      }
    }

    if (!global.games) global.games = {}
    global.games[m.chat] = {
      type: 'miner',
      game,
      players: [challenger, opponent],
      startTime: Date.now(),
    }

    if (game.onTimeout) game.startInactivityTimeout()

    const turnName = getMinerPlayerName(game.currentPlayer, conn, groupParts)
    const caption = `MINER iniciado\nTurno de @${game.currentPlayer.split('@')[0]} (${turnName})\nResponde con el numero *1-10*`

    return sendMinerBoard(conn, m.chat, game, {
      quoted: m,
      caption,
      mentionedJid: [game.currentPlayer],
      participants: groupParts,
      status: 'playing',
    })
  } catch (e) {
    console.error('Error aceptando invitacion miner:', e)
  }
}

export async function rejectInvite(m, conn, invite) {
  try {
    clearPendingInvite(m.chat, invite)
    return conn.sendMessage(m.chat, {
      text: 'Invitacion a Miner rechazada.',
      contextInfo: { ...rcanal.contextInfo },
    }, { quoted: m })
  } catch (e) {
    console.error('Error rejectInvite miner:', e)
  }
}

export async function handleMove(m, conn, gameData) {
  try {
    const game = gameData.game
    if (!game || !game.gameActive) return
    if (!game.isPlayer(m.sender)) return

    const groupParts = await conn.groupMetadata(m.chat).then(g => g.participants).catch(() => [])

    const text = (m.text || '').trim()
    if (!/^[0-9]+$/.test(text)) return
    const pos = parseInt(text)
    if (pos < 1 || pos > 10) return

    if (game.currentPlayer !== m.sender) {
      return conn.sendMessage(m.chat, {
        text: 'No es tu turno.',
        contextInfo: { ...rcanal.contextInfo },
      }, { quoted: m })
    }

    const res = game.openCell(pos - 1, m.sender)
    if (!res.ok) {
      if (res.reason === 'already') {
        return conn.sendMessage(m.chat, {
          text: 'Esa casilla ya fue abierta.',
          contextInfo: { ...rcanal.contextInfo },
        }, { quoted: m })
      }
      return
    }

    if (game.isFinished()) {
      return handleGameEnd(m, conn, game, groupParts, pos - 1)
    }

    const nextPlayer = game.currentPlayer
    const nextName = getMinerPlayerName(nextPlayer, conn, groupParts)
    const caption = `@${m.sender.split('@')[0]}: ${res.result.text}\n\nTurno de @${nextPlayer.split('@')[0]} (${nextName})`

    return sendMinerBoard(conn, m.chat, game, {
      quoted: m,
      caption,
      mentionedJid: [m.sender, nextPlayer],
      participants: groupParts,
      status: 'playing',
      highlightIndex: pos - 1,
    })
  } catch (e) {
    console.error('Error handleMove miner:', e)
  }
}

export async function handleGameEnd(m, conn, game, participants = [], highlightIndex = null) {
  try {
    const chatId = game.chatId || m.chat
    const groupParts = participants?.length
      ? participants
      : await conn.groupMetadata(chatId).then(g => g.participants).catch(() => [])

    try { game.clearTimeout?.() } catch {}
    try { game.cancelGame?.('finished') } catch {}
    if (game) game.onTimeout = null

    if (global.games?.[chatId]) delete global.games[chatId]

    const p1 = game.player1
    const p2 = game.player2
    const s1 = game.summary[p1].gained || 0
    const s2 = game.summary[p2].gained || 0
    const winner = getMinerWinner(game)
    const p1Name = getMinerPlayerName(p1, conn, groupParts)
    const p2Name = getMinerPlayerName(p2, conn, groupParts)

    const caption = `MINER FINALIZADO\n\n@${p1.split('@')[0]} (${p1Name}): ${s1 >= 0 ? '+' : ''}${s1} ${global.moneda}\n@${p2.split('@')[0]} (${p2Name}): ${s2 >= 0 ? '+' : ''}${s2} ${global.moneda}`

    return sendMinerBoard(conn, chatId, game, {
      quoted: m,
      caption,
      mentionedJid: [p1, p2],
      participants: groupParts,
      status: 'finished',
      winnerJid: winner,
      highlightIndex,
    })
  } catch (e) {
    console.error('Error handleGameEnd miner:', e)
  }
}

export { MinerGame }
