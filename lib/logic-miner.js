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

class JuegoMinero {
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

  esJugador(player) {
    return player === this.player1 || player === this.player2
  }

  abrirCelda(index, player) {
    if (index < 0 || index >= this.cells.length) return { ok: false, reason: 'invalid' }
    const celda = this.cells[index]
    if (celda.opened) return { ok: false, reason: 'already' }

    const rand = Math.random()
    let resultado = { type: 'gain', amount: 0, text: '' }

    if (rand < 0.4) {
      const amt = Math.floor(Math.random() * (500 - 100 + 1)) + 100
      resultado.type = 'gain'
      resultado.amount = amt
      resultado.text = `ENCONTRASTE +${amt} USD`
    } else {
      const amt = Math.floor(Math.random() * (150 - 50 + 1)) + 50
      resultado.type = 'lose'
      resultado.amount = amt
      resultado.text = `PERDISTE -${amt} USD`
    }

    celda.opened = true
    celda.result = resultado
    this.openedCount += 1
    this.moves++
    this.lastMove = Date.now()

    if (resultado.type === 'gain' || resultado.type === 'big') {
      global.db.data.users[player] = global.db.data.users[player] || {}
      global.db.data.users[player].coins = (global.db.data.users[player].coins || 0) + resultado.amount
      this.summary[player].gained += resultado.amount
    } else if (resultado.type === 'lose') {
      global.db.data.users[player] = global.db.data.users[player] || {}
      const user = global.db.data.users[player]
      const billetera = user.coins || 0
      const banco = user.bancoDinero || 0
      const total = billetera + banco
      const perdida = Math.min(total, resultado.amount)

      let restante = perdida
      const deBilletera = Math.min(billetera, restante)
      user.coins = billetera - deBilletera
      restante -= deBilletera
      if (restante > 0) {
        user.bancoDinero = Math.max(0, banco - restante)
      }
      this.summary[player].gained -= perdida
      resultado.amount = perdida
    }

    this.currentPlayer = player === this.player1 ? this.player2 : this.player1

    if (this.onTimeout) this.iniciarTimeoutInactividad()

    return { ok: true, result: resultado, index }
  }

  estaTerminado() {
    return this.openedCount >= this.cells.length
  }

  cancelarJuego(reason = 'inactividad') {
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

  iniciarTimeoutInactividad() {
    if (this.timeout) clearTimeout(this.timeout)
    if (!this.onTimeout) return

    this.timeout = setTimeout(async () => {
      if (this.gameActive) await this.onTimeout(this.cancelarJuego('inactividad'))
    }, 60000)
  }

  limpiarTimeout() {
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }
  }
}

JuegoMinero.prototype.isPlayer = JuegoMinero.prototype.esJugador
JuegoMinero.prototype.openCell = JuegoMinero.prototype.abrirCelda
JuegoMinero.prototype.isFinished = JuegoMinero.prototype.estaTerminado
JuegoMinero.prototype.cancelGame = JuegoMinero.prototype.cancelarJuego
JuegoMinero.prototype.startInactivityTimeout = JuegoMinero.prototype.iniciarTimeoutInactividad
JuegoMinero.prototype.clearTimeout = JuegoMinero.prototype.limpiarTimeout

function limpiarInvitacionPendiente(chat, invite) {
  if (invite?.timeout) clearTimeout(invite.timeout)
  if (global.pendingInvites?.[chat]) delete global.pendingInvites[chat]
}

export async function aceptarInvitacion(m, conn, invite, participants = []) {
  try {
    const groupParts = participants?.length
      ? participants
      : await conn.groupMetadata(m.chat).then(g => g.participants).catch(() => [])

    const challenger = invite.challenger
    const opponent = invite.opponent

    if (!canPlayMiner(challenger, conn, groupParts)) {
      limpiarInvitacionPendiente(m.chat, invite)
      return conn.sendMessage(m.chat, {
        text: `[❌] @${challenger.split('@')[0]} ya no tiene fondos suficientes.\n> Minimo: ${MINER_MIN_COINS} ${global.moneda}`,
        contextInfo: { ...rcanal.contextInfo, mentionedJid: [challenger] },
      }, { quoted: m })
    }

    if (!canPlayMiner(opponent, conn, groupParts)) {
      limpiarInvitacionPendiente(m.chat, invite)
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

    const game = new JuegoMinero(challenger, opponent, m.chat)
    game.conn = conn
    game.originalMessage = m
    game.penaltyRange = invite.penaltyRange || [50, 150]

    game.onTimeout = async (cancelledGame) => {
      try {
        const inactivePlayer = cancelledGame.currentPlayer
        const penalty = 150
        if (global.db.data.users[inactivePlayer]) {
          const user = global.db.data.users[inactivePlayer]
          const billetera = user.coins || 0
          const banco = user.bancoDinero || 0
          const total = billetera + banco
          const perdida = Math.min(total, penalty)
          let restante = perdida
          const deBilletera = Math.min(billetera, restante)
          user.coins = billetera - deBilletera
          restante -= deBilletera
          if (restante > 0) user.bancoDinero = Math.max(0, banco - restante)

          await conn.sendMessage(m.chat, {
            text: `Timeout: @${inactivePlayer.split('@')[0]} no respondio y fue penalizado -${perdida} ${global.moneda}`,
            contextInfo: { ...rcanal.contextInfo, mentionedJid: [inactivePlayer] },
          }).catch(() => {})
        }

        const simulatedM = { ...game.originalMessage }
        simulatedM.sender = 'system@timeout'
        simulatedM.fromMe = false
        simulatedM.key = { ...(simulatedM.key || {}), fromMe: false, id: 'timeout-' + Date.now() }
        await manejarFinJuego(simulatedM, conn, cancelledGame, groupParts)
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

    if (game.onTimeout) game.iniciarTimeoutInactividad()

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

export async function rechazarInvitacion(m, conn, invite) {
  try {
    limpiarInvitacionPendiente(m.chat, invite)
    return conn.sendMessage(m.chat, {
      text: 'Invitacion a Miner rechazada.',
      contextInfo: { ...rcanal.contextInfo },
    }, { quoted: m })
  } catch (e) {
    console.error('Error rejectInvite miner:', e)
  }
}

export async function manejarMovimiento(m, conn, gameData) {
  try {
    const game = gameData.game
    if (!game || !game.gameActive) return
    if (!game.esJugador(m.sender)) return

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

    const res = game.abrirCelda(pos - 1, m.sender)
    if (!res.ok) {
      if (res.reason === 'already') {
        return conn.sendMessage(m.chat, {
          text: 'Esa casilla ya fue abierta.',
          contextInfo: { ...rcanal.contextInfo },
        }, { quoted: m })
      }
      return
    }

    if (game.estaTerminado()) {
      return manejarFinJuego(m, conn, game, groupParts, pos - 1)
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

export async function manejarFinJuego(m, conn, game, participants = [], highlightIndex = null) {
  try {
    const chatId = game.chatId || m.chat
    const groupParts = participants?.length
      ? participants
      : await conn.groupMetadata(chatId).then(g => g.participants).catch(() => [])

    try { game.limpiarTimeout?.() } catch {}
    try { game.cancelarJuego?.('finished') } catch {}
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

export {
  JuegoMinero as MinerGame,
  JuegoMinero,
  aceptarInvitacion as acceptInvite,
  rechazarInvitacion as rejectInvite,
  manejarMovimiento as handleMove,
  manejarFinJuego as handleGameEnd
}
