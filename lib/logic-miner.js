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
    } else if (result.type === 'item') {
      
      global.db.data.users[player] = global.db.data.users[player] || {}
      if (!global.db.data.users[player].inventory) global.db.data.users[player].inventory = []
      global.db.data.users[player].inventory.push({ name: result.item, source: 'miner' })
    }

    
    this.currentPlayer = player === this.player1 ? this.player2 : this.player1

    if (this.onTimeout) this.startInactivityTimeout()

    return { ok: true, result }
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
      reason: reason,
      player1: this.player1,
      player2: this.player2,
      players: [this.player1, this.player2],
      chatId: this.chatId,
      currentPlayer: this.currentPlayer,
      summary: this.summary
    }
  }

  startInactivityTimeout() {
    if (this.timeout) {
      clearTimeout(this.timeout)
    }

    if (!this.onTimeout) return

    this.timeout = setTimeout(async () => {
      if (this.gameActive) {
        await this.onTimeout(this.cancelGame('inactividad'))
      }
    }, 60000)
  }

  clearTimeout() {
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }
  }
}

export async function acceptInvite(m, conn, invite) {
  try {
    if (invite.timeout) clearTimeout(invite.timeout)
    delete global.pendingInvites[m.chat]

    
    if (global.games && global.games[m.chat]) {
      return conn.sendMessage(m.chat, { text: 'Ya hay un juego de Miner activo en este grupo. Espera a que termine.' }, { quoted: m })
    }

    const game = new MinerGame(invite.challenger, invite.opponent, m.chat)
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
          if (remaining > 0) {
            user.bancoDinero = Math.max(0, bank - remaining)
          }
          
          try {
            const simulatedM = { ...game.originalMessage }
            simulatedM.sender = 'system@timeout'
            simulatedM.fromMe = false
            simulatedM.key = { ...(simulatedM.key || {}), fromMe: false, id: 'timeout-' + Date.now() }
            await conn.sendMessage(m.chat, { text: `⏱️ Timeout: @${inactivePlayer.split('@')[0]} no respondió y fue penalizado -${loss} ${global.moneda}`, contextInfo: { ...rcanal.contextInfo, mentionedJid: [inactivePlayer] } })
          } catch (errNotify) {
            console.error('Error notifying timeout penalty:', errNotify)
          }
        }

        
        try {
          const simulatedM = { ...game.originalMessage }
          simulatedM.sender = 'system@timeout'
          simulatedM.fromMe = false
          simulatedM.key = { ...(simulatedM.key || {}), fromMe: false, id: 'timeout-' + Date.now() }
          return await handleGameEnd(simulatedM, conn, cancelledGame)
        } catch (errEnd) {
          console.error('Error ending miner on timeout:', errEnd)
        }
      } catch (e) {
        console.error('Error in miner onTimeout handler:', e)
      }
    }


    if (!global.games) global.games = {}
    global.games[m.chat] = {
      type: 'miner',
      game: game,
      players: [invite.challenger, invite.opponent],
      startTime: Date.now()
    }

    const board = renderBoard(game)
    const msg = ` 𓍯  𝗠𝗜𝗡𝗘𝗥 𝗚𝗔𝗠𝗘 𓍯\n  Turno de: @${game.currentPlayer.split('@')[0]}\n│\n${board}\n\nResponde con un número (1-10) para abrir la casilla.`

    
    if (game.onTimeout) game.startInactivityTimeout()

    return conn.sendMessage(m.chat, { text: msg, contextInfo: { ...rcanal.contextInfo, mentionedJid: [game.currentPlayer] } }, { quoted: m })
  } catch (e) {
    console.error('Error aceptando invitación miner:', e)
  }
}

export async function rejectInvite(m, conn, invite) {
  try {
    if (invite.timeout) clearTimeout(invite.timeout)
    delete global.pendingInvites[m.chat]
    return conn.sendMessage(m.chat, { text: 'Invitación a Miner rechazada.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
  } catch (e) {
    console.error('Error rejectInvite miner:', e)
  }
}

function renderBoard(game) {
  const emojiMap = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟']
  let out = ''
  for (let r = 0; r < 2; r++) {
    let row = ''
    for (let c = 0; c < 5; c++) {
      const idx = r * 5 + c
      if (idx >= game.cells.length) continue
      if (game.cells[idx].opened) row += '❌ '
      else row += `${emojiMap[idx]} `
    }
    out += row.trim() + '\n'
  }
  return '```\n' + out + '```'
}

export async function handleMove(m, conn, gameData) {
  try {
    const game = gameData.game
    if (!game) return
    if (!game.isPlayer(m.sender)) return

    const text = (m.text || '').trim()
    if (!/^[0-9]+$/.test(text)) return
    const pos = parseInt(text)
    if (pos < 1 || pos > 10) return

    if (game.currentPlayer !== m.sender) {
      return conn.sendMessage(m.chat, { text: 'No es tu turno.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
    }

    const res = game.openCell(pos - 1, m.sender)
    if (!res.ok) {
      if (res.reason === 'already') return conn.sendMessage(m.chat, { text: 'Esa casilla ya fue abierta.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
      return
    }

    let msg = `𓍯  𝗠𝗜𝗡𝗘𝗥 𝗔𝗖𝗧𝗜𝗢𝗡 𓍯\n` +
      `> Usuario: @${m.sender.split('@')[0]}\n` +
      `> Casilla: ${pos}\n` +
      `> Resultado: ${res.result.text}`

    await conn.sendMessage(m.chat, { text: msg, contextInfo: { ...rcanal.contextInfo, mentionedJid: [m.sender] } }, { quoted: m })

    
    const board = renderBoard(game)
    const nextPlayer = game.currentPlayer
    await conn.sendMessage(m.chat, { text: `Tablero actualizado:\n${board}\nTurno de: @${nextPlayer.split('@')[0]}`, contextInfo: { ...rcanal.contextInfo, mentionedJid: [nextPlayer] } })

    if (game.isFinished()) {
      return handleGameEnd(m, conn, game)
    }

  } catch (e) {
    console.error('Error handleMove miner:', e)
  }
}

export async function handleGameEnd(m, conn, game) {
  try {
    const chatId = game.chatId || m.chat

   
    try {
      if (game && typeof game.clearTimeout === 'function') game.clearTimeout()
    } catch (e) {
      console.error('Error clearing miner timeout:', e)
    }
    try {
      if (game && typeof game.cancelGame === 'function') game.cancelGame('finished')
    } catch (e) {
      console.error('Error cancelling miner game:', e)
    }
    if (game && 'onTimeout' in game) try { game.onTimeout = null } catch (e) {}

    if (global.games && global.games[chatId]) delete global.games[chatId]

    const p1 = game.player1
    const p2 = game.player2
    const s1 = game.summary[p1].gained || 0
    const s2 = game.summary[p2].gained || 0

    let message = `𓍯  𝗠𝗜𝗡𝗘𝗥 𝗙𝗜𝗡𝗜𝗦𝗛 𓍯\n` +
      `> @${p1.split('@')[0]} → ${s1 >= 0 ? '+' + s1 : s1} ${global.moneda}\n` +
      `> @${p2.split('@')[0]} → ${s2 >= 0 ? '+' + s2 : s2} ${global.moneda}\n` +
      `\nGracias por jugar.`

    return conn.sendMessage(chatId, { text: message, contextInfo: { ...rcanal.contextInfo, mentionedJid: [p1, p2] } }, { quoted: m })
  } catch (e) {
    console.error('Error handleGameEnd miner:', e)
  }
}
