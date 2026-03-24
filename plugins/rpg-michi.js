import { TicTacToe, getRandomReward, getInactivityPenalty } from '../lib/3enraya.js'

let handler = async (m, { conn, args, usedPrefix, command }) => {
  try {
    
    if (!m.isGroup) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Este comando solo puede ser usado en grupos.',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    
    if (global.games && global.games[m.chat] && global.games[m.chat].type === 'tictactoe') {
      return conn.sendMessage(m.chat, {
        text: '[❌] Ya hay un juego de 3 en raya activo en este grupo. Espera a que termine.',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    
    if (global.pendingInvites && global.pendingInvites[m.chat]) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Ya hay una invitación pendiente en este grupo. Espera a que sea aceptada o rechazada.',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    
    if (!m.mentionedJid || m.mentionedJid.length === 0) {
      return conn.sendMessage(m.chat, {
        text: `[❗] Debes mencionar al jugador que quieres retar.\n\n> Ejemplo: ${usedPrefix + command} @usuario`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    const opponent = m.mentionedJid[0]

    
    if (opponent === m.sender) {
      return conn.sendMessage(m.chat, {
        text: '[❌] No puedes jugar contra ti mismo.',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    
    if (opponent === conn.user.jid) {
      return conn.sendMessage(m.chat, {
        text: '[❌] No puedes jugar contra el bot.',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    
    if (!global.db.data.users[opponent]) {
      return conn.sendMessage(m.chat, {
        text: '[❌] El usuario mencionado no está registrado en el bot.',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    
    const player1Coins = global.db.data.users[m.sender]?.coins || 0
    const player2Coins = global.db.data.users[opponent]?.coins || 0

    if (player1Coins < 20) {
      return conn.sendMessage(m.chat, {
        text: '[❌] No tienes suficientes monedas para jugar. Necesitas al menos 20 monedas.',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    if (player2Coins < 20) {
      return conn.sendMessage(m.chat, {
        text: `[❗] @${opponent.split('@')[0]} no tiene suficientes monedas para jugar.`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [opponent]
        }
      }, { quoted: m })
    }

    
    if (!global.pendingInvites) global.pendingInvites = {}

    global.pendingInvites[m.chat] = {
      challenger: m.sender,
      opponent: opponent,
      timestamp: Date.now(),
      timeout: null
    }

    
    global.pendingInvites[m.chat].timeout = setTimeout(() => {
      if (global.pendingInvites && global.pendingInvites[m.chat]) {
        delete global.pendingInvites[m.chat]
        conn.sendMessage(m.chat, {
          text: `𝙉𝙑𝙄𝙏𝘼𝘾𝙄𝙊𝙉 𝙀𝙓𝙋𝙄𝙍𝘼𝘿𝘼\n> 𓂃 ࣪ ִֶָ☾.  @${opponent.split('@')[0]} 𝘯𝘰 𝘳𝘦𝘴𝘱𝘰𝘯𝘥𝘪ó 𝘢 𝘵𝘪𝘦𝘮𝘱𝘰`,
          contextInfo: {
            ...rcanal.contextInfo,
            mentionedJid: [opponent]
          }
        })
      }
    }, 20000) 

    
    const message = `╭─╮  𓍯  𝙄𝙉𝙑𝙄𝙏𝘼𝘾𝙄𝙊𝙉 𝘼 𝙅𝙐𝙀𝙂𝙊  𓍯  
│  𓂃 ࣪ ִֶָ☾.  @${m.sender.split('@')[0]} 𝘲𝘶𝘪𝘦𝘳𝘦 𝘫𝘶𝘨𝘢𝘳 3 𝘦𝘯 𝘳𝘢𝘺𝘢 𝘤𝘰𝘯𝘵𝘪𝘨𝘰
│  𓂃 ࣪ ִֶָ☾.  @${opponent.split('@')[0]} 𝘳𝘦𝘴𝘱𝘰𝘯𝘥𝘦 𝘦𝘯 20 𝘴𝘦𝘨𝘶𝘯𝘥𝘰𝘴
│
│  𓂃 ࣪ ִֶָ☾.  𝙋𝙍𝙀𝙈𝙄𝙊: 450-700 ${global.moneda}
│  𓂃 ࣪ ִֶָ☾.  𝙀𝙈𝙋𝘼𝙏𝙀: 150 ${global.moneda} 𝙘𝙖𝙙𝙖
│  𓂃 ࣪ ִֶָ☾.  𝙍𝙄𝙀𝙎𝙂𝙊: 150 ${global.moneda} 𝙥𝙤𝙧 𝙞𝙣𝙖𝙘𝙩𝙞𝙫𝙞𝙙𝙖𝙙
│
│  𓂃 ࣪ ִֶָ☾.  𝙍𝙀𝙎𝙋𝙊𝙉𝘿𝙀:
│  𓂃 ࣪ ִֶָ☾.  ✅ 𝘴𝘪 - 𝘈𝘤𝘦𝘱𝘵𝘢𝘳
│  𓂃 ࣪ ִֶָ☾.  ❌ 𝘯𝘰 - 𝘙𝘦𝘤𝘩𝘢𝘻𝘢𝘳
│
│  𓂃 ࣪ ִֶָ☾.  𝙏𝙄𝙀𝙈𝙋𝙊: 20𝘴
╰─╯`.trim()

    return conn.sendMessage(m.chat, {
      text: message,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender, opponent]
      }
    }, { quoted: m })

  } catch (e) {
    console.error('Error en comando michi:', e)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error al enviar la invitación.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}


export async function acceptInvite(m, conn, invite) {
  try {
    
    if (invite.timeout) {
      clearTimeout(invite.timeout)
    }

    
    delete global.pendingInvites[m.chat]

    
    const game = new TicTacToe(invite.challenger, invite.opponent, m.chat, null)
    
    
    game.conn = conn
    game.originalMessage = m
    
    
    game.onTimeout = async (cancelledGame) => {
      
      const gameData = global.games && global.games[game.chatId]
      if (gameData && gameData.type === 'tictactoe') {
        
        const simulatedM = { ...game.originalMessage }
        simulatedM.sender = 'system@timeout'
        simulatedM.fromMe = false
        simulatedM.key = {
          ...simulatedM.key,
          fromMe: false,
          id: 'timeout-' + Date.now()
        }
        
        
        await handleGameEnd(simulatedM, game.conn, game, 'timeout')
      }
    }

    
    if (!global.games) global.games = {}
    if (!global.games[m.chat]) global.games[m.chat] = {}

    global.games[m.chat] = {
      type: 'tictactoe',
      game: game,
      players: [invite.challenger, invite.opponent],
      startTime: Date.now()
    }

    
    game.startInactivityTimeout()

    
    const board = game.getBoard()
    const message = `╭─╮  𓍯  3 𝙀𝙉 𝙍𝘼𝙔𝘼 𝙄𝙉𝙄𝘾𝙄𝘼𝘿𝙊  𓍯  
│  𓂃 ࣪ ִֶָ☾.  ❌ @${invite.challenger.split('@')[0]} (𝙅𝙪𝙜𝙖𝙖𝙙𝙤𝙧 1)
│  𓂃 ࣪ ִֶָ☾.  ⭕ @${invite.opponent.split('@')[0]} (𝙅𝙪𝙜𝙖𝙖𝙙𝙤𝙧 2)
│
│  𓂃 ࣪ ִֶָ☾.  𝙄𝙉𝙎𝙏𝙍𝙐𝘾𝘾𝙄𝙊𝙉𝙀𝙎:
│  𓂃 ࣪ ִֶָ☾.  𝙍𝙚𝙨𝙥𝙤𝙣𝙙𝙚 𝙘𝙤𝙣 𝙚𝙡 𝙣ú𝙢𝙚𝙧𝙤 (1-9)
│  𓂃 ࣪ ִֶָ☾.  ❌ = 𝙅𝙪𝙜𝙖𝙖𝙙𝙤𝙧 1, ⭕ = 𝙅𝙪𝙜𝙖𝙖𝙙𝙤𝙧 2
│  𓂃 ࣪ ִֶָ☾.  𝙂𝙖𝙣𝙖 𝙦𝙪𝙞𝙚𝙣 𝙛𝙤𝙧𝙢𝙚 𝙡í𝙣𝙚𝙖 𝙙𝙚 3
│  𓂃 ࣪ ִֶָ☾.  1 𝙢𝙞𝙣𝙪𝙩𝙤 𝙥𝙤𝙧 𝙩𝙪𝙧𝙣𝙤 𝙤 𝙨𝙚 𝙘𝙖𝙣𝙘𝙚𝙡𝙖
│
│  𓂃 ࣪ ִֶָ☾.  𝙋𝙍𝙀𝙈𝙄𝙊: 450-700 ${global.moneda}
│  𓂃 ࣪ ִֶָ☾.  𝙀𝙈𝙋𝘼𝙏𝙀: 150 ${global.moneda} 𝙘𝙖𝙙𝙖
│  𓂃 ࣪ ִֶָ☾.  𝙍𝙄𝙀𝙎𝙂𝙊: 150 ${global.moneda} 𝙥𝙤𝙧 𝙞𝙣𝙖𝙘𝙩𝙞𝙫𝙞𝙙𝙖𝙙
│
${board}
│
│  𓂃 ࣪ ִֶָ☾.  🎯 𝙏𝙐𝙍𝙉𝙊 𝘿𝙀: @${invite.challenger.split('@')[0]} (❌)
╰─╯`.trim()

    return conn.sendMessage(m.chat, {
      text: message,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [invite.challenger, invite.opponent]
      }
    }, { quoted: m })

  } catch (e) {
    console.error('Error al aceptar invitación:', e)
    return conn.sendMessage(m.chat, {
      text: '❌ Error al iniciar el juego.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}


export async function rejectInvite(m, conn, invite) {
  try {

    if (invite.timeout) {
      clearTimeout(invite.timeout)
    }

    
    delete global.pendingInvites[m.chat]

    
    const message = `𝙄𝙉𝙑𝙄𝙏𝘼𝘾𝙄𝙊𝙉 𝙍𝙀𝘾𝙃𝘼𝙕𝘼𝘿𝘼\n> 𓂃 ࣪ ִֶָ☾.  @${invite.opponent.split('@')[0]} 𝘳𝘦𝘤𝘩𝘢𝘻ó 𝘭𝘢 𝘪𝘯𝘷𝘪𝘵𝘢𝘤𝘪ó𝘯
 𓂃 ࣪ ִֶָ☾.  𝘥𝘦 @${invite.challenger.split('@')[0]}`.trim()

    return conn.sendMessage(m.chat, {
      text: message,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [invite.challenger, invite.opponent]
      }
    }, { quoted: m })

  } catch (e) {
    console.error('Error al rechazar invitación:', e)
  }
}
export async function handleGameEnd(m, conn, cancelledGame, reason = 'finished') {
  try {
    const chatId = cancelledGame.chatId || m.chat
    const game = cancelledGame

    
    if (game.clearTimeout && typeof game.clearTimeout === 'function') {
      game.clearTimeout()
    }

    
    if (global.games && global.games[chatId]) {
      delete global.games[chatId]
    }

    let message = ''

    if (reason === 'timeout') {
      
      const penalty = getInactivityPenalty()
      const inactivePlayer = game.currentPlayer

      if (global.db.data.users[inactivePlayer]) {
        global.db.data.users[inactivePlayer].coins = Math.max(0, (global.db.data.users[inactivePlayer].coins || 0) - penalty)
      }

      
      const player1 = game.player1
      const player2 = game.player2

      message = `𝙅𝙐𝙀𝙂𝙊 𝘾𝘼𝙉𝘾𝙀𝙇𝘼𝘿𝙊\n> 𓂃 ࣪ ִֶָ☾.   𝙅𝙪𝙜𝙖𝙙𝙤𝙧 𝙥𝙚𝙣𝙖𝙡𝙞𝙯𝙖𝙙𝙤:  𓂃 ࣪ ִֶָ☾.   @${inactivePlayer.split('@')[0]} (-${penalty} ${global.moneda})\n> 𓂃 ࣪ ִֶָ☾.  📝 𝙈𝙤𝙩𝙞𝙫𝙤: 𝙉𝙤 𝙝𝙪𝙗𝙤 𝙖𝙘𝙩𝙞𝙫𝙞𝙙𝙖𝙙 𝙙𝙪𝙧𝙖𝙣𝙩𝙚 1 𝙢𝙞𝙣𝙪𝙩𝙤`.trim()

    } else if (game.winner) {
      
      const reward = getRandomReward()

      
      if (global.db.data.users[game.winner]) {
        global.db.data.users[game.winner].coins = (global.db.data.users[game.winner].coins || 0) + reward
      }

      const loser = game.winner === game.player1 ? game.player2 : game.player1
      const winnerName = game.winner === game.player1 ? '𝙅𝙪𝙜𝙖𝙖𝙙𝙤𝙧 1 (❌)' : '𝙅𝙪𝙜𝙖𝙖𝙙𝙤𝙧 2 (⭕)'
      const loserName = game.winner === game.player1 ? '𝙅𝙪𝙜𝙖𝙖𝙙𝙤𝙧 2 (⭕)' : '𝙅𝙪𝙜𝙖𝙖𝙙𝙤𝙧 1 (❌)'

      message = `╭─╮  𓍯  𝙅𝙐𝙀𝙂𝙊 𝙏𝙀𝙍𝙈𝙄𝙉𝘼𝘿𝙊  𓍯  
│  𓂃 ࣪ ִֶָ☾.  𝙂𝙖𝙣𝙖𝙙𝙤𝙧: @${game.winner.split('@')[0]} (${winnerName})
│  𓂃 ࣪ ִֶָ☾.  𝙋𝙚𝙧𝙙𝙚𝙙𝙤𝙧: @${loser.split('@')[0]} (${loserName})
│
│  𓂃 ࣪ ִֶָ☾.  𝙋𝙧𝙚𝙢𝙞𝙤: +${reward} ${global.moneda}
│  𓂃 ࣪ ִֶָ☾.  𝙏𝙤𝙩𝙖𝙡: ${global.db.data.users[game.winner]?.coins || 0} ${global.moneda}
╰─╯`.trim()

    } else {
      
      const drawReward = 150

      if (global.db.data.users[game.player1]) {
        global.db.data.users[game.player1].coins = (global.db.data.users[game.player1].coins || 0) + drawReward
      }
      if (global.db.data.users[game.player2]) {
        global.db.data.users[game.player2].coins = (global.db.data.users[game.player2].coins || 0) + drawReward
      }

      message = `╭─╮  𓍯  𝙅𝙐𝙀𝙂𝙊 𝙀𝙈𝙋𝘼𝙏𝘼𝘿𝙊  𓍯
│  𓂃 ࣪ ִֶָ☾.  👥 𝙅𝙪𝙜𝙖𝙙𝙤𝙧𝙚𝙨:
│  𓂃 ࣪ ִֶָ☾.  ❌ @${game.player1.split('@')[0]} (+${drawReward} ${global.moneda})
│  𓂃 ࣪ ִֶָ☾.  ⭕ @${game.player2.split('@')[0]} (+${drawReward} ${global.moneda})
│
│  𓂃 ࣪ ִֶָ☾.  📝 𝙍𝙚𝙨𝙪𝙡𝙩𝙖𝙙𝙤: 𝙉𝙖𝙙𝙞𝙚 𝙜𝙖𝙣ó
│  𓂃 ࣪ ִֶָ☾.  💰 𝙍𝙚𝙘𝙤𝙢𝙥𝙚𝙣𝙨𝙖: +${drawReward} ${global.moneda} cada uno
╰─╯`.trim()
    }

    
    let playersToMention = []
    if (reason === 'timeout') {
      
      playersToMention = [game.player1, game.player2]
    } else if (game.winner) {
      const loser = game.winner === game.player1 ? game.player2 : game.player1
      playersToMention = [game.winner, loser]
    } else {
      playersToMention = [game.player1, game.player2]
    }

    return conn.sendMessage(chatId, {
      text: message,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: playersToMention
      }
    }, { quoted: m })

  } catch (e) {
    console.error('Error al finalizar juego:', e)
  }
}

handler.help = ['michi\n→ Juega 3 en raya mencionando a otro usuario registrado\n→ El oponente debe responder "si" o "no" en 20 segundos']
handler.tags = ['juegos', 'multijugador']
handler.command = ['michi', '3enraya', 'tictactoe', 'ttt']
handler.group = true

export default handler
