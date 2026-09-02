import { TicTacToe, getRandomReward, getInactivityPenalty } from '../lib/3enraya.js'
import { sendMichiBoard, sendMichiInvite } from '../lib/michi-board.js'
import { resolveTargetJids } from '../lib/group-participant.js'
import {
  MICHI_MIN_COINS,
  resolveDbUser,
  canPlayMichi,
  isSamePlayer,
  formatMichiBalance,
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

    const opponentRaw = m.mentionedJid[0]
    const groupParts = participants || []

    const challengerData = resolveDbUser(m.sender, conn, groupParts)
    const opponentData = resolveDbUser(opponentRaw, conn, groupParts)

    if (isSamePlayer(opponentRaw, m.sender, conn, groupParts)) {
      return conn.sendMessage(m.chat, {
        text: '[❌] No puedes jugar contra ti mismo.',
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
        text: '[❌] El usuario mencionado no está registrado en el bot.',
        contextInfo: { ...rcanal.contextInfo },
      }, { quoted: m })
    }

    if (!canPlayMichi(challengerData.jid, conn, groupParts)) {
      return conn.sendMessage(m.chat, {
        text: `[❌] No tienes suficientes monedas para jugar.\n> Tienes: ${formatMichiBalance(challengerData.jid, conn, groupParts)}\n> Mínimo: ${MICHI_MIN_COINS} ${global.moneda}`,
        contextInfo: { ...rcanal.contextInfo },
      }, { quoted: m })
    }

    if (!canPlayMichi(opponentData.jid, conn, groupParts)) {
      return conn.sendMessage(m.chat, {
        text: `[❌] @${opponentData.jid.split('@')[0]} no tiene suficientes monedas para jugar.\n> Tiene: ${formatMichiBalance(opponentData.jid, conn, groupParts)}\n> Mínimo: ${MICHI_MIN_COINS} ${global.moneda}`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [opponentData.jid],
        },
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

    
    const caption = `@${opponent.split('@')[0]} responde en *20 segundos*\n\n> *si* — Aceptar\n> *no* — Rechazar`

    return sendMichiInvite(conn, m.chat, {
      challenger,
      opponent,
      quoted: m,
      caption,
      mentionedJid: [challenger, opponent],
    })

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


export async function acceptInvite(m, conn, invite, participants = []) {
  try {
    const groupParts = participants?.length
      ? participants
      : await conn.groupMetadata(m.chat).then(g => g.participants).catch(() => [])

    const challenger = invite.challenger
    const opponent = invite.opponent

    if (!canPlayMichi(challenger, conn, groupParts)) {
      clearPendingInvite(m.chat, invite)
      return conn.sendMessage(m.chat, {
        text: `[❌] @${challenger.split('@')[0]} ya no tiene monedas suficientes.\n> Mínimo: ${MICHI_MIN_COINS} ${global.moneda}`,
        contextInfo: { ...rcanal.contextInfo, mentionedJid: [challenger] },
      }, { quoted: m })
    }

    if (!canPlayMichi(opponent, conn, groupParts)) {
      clearPendingInvite(m.chat, invite)
      return conn.sendMessage(m.chat, {
        text: `[❌] No tienes monedas suficientes para jugar.\n> Tienes: ${formatMichiBalance(opponent, conn, groupParts)}\n> Mínimo: ${MICHI_MIN_COINS} ${global.moneda}`,
        contextInfo: { ...rcanal.contextInfo, mentionedJid: [opponent] },
      }, { quoted: m })
    }

    if (invite.timeout) clearTimeout(invite.timeout)
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

    
    const caption = `╭─╮  𓍯  3 EN RAYA INICIADO  𓍯
│  ❌ @${invite.challenger.split('@')[0]}
│  ⭕ @${invite.opponent.split('@')[0]}
│
│  Responde con el número *1-9*
│  Premio: 450-700 ${global.moneda}
╰─╯`.trim()

    return sendMichiBoard(conn, m.chat, game, {
      quoted: m,
      caption,
      mentionedJid: [invite.challenger, invite.opponent],
      status: 'playing',
    })
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
    let boardStatus = 'playing'
    let boardStatusText = ''
    let highlightCells = null
    let playersToMention = []

    if (reason === 'timeout') {
      
      const penalty = getInactivityPenalty()
      const inactivePlayer = game.currentPlayer

      if (global.db.data.users[inactivePlayer]) {
        global.db.data.users[inactivePlayer].coins = Math.max(0, (global.db.data.users[inactivePlayer].coins || 0) - penalty)
      }

      
      const player1 = game.player1
      const player2 = game.player2

      message = `𝙅𝙐𝙀𝙂𝙊 𝘾𝘼𝙉𝘾𝙀𝙇𝘼𝘿𝙊\n> 𓂃 ࣪ ִֶָ☾.   𝙅𝙪𝙜𝙖𝙙𝙤𝙧 𝙥𝙚𝙣𝙖𝙡𝙞𝙯𝙖𝙙𝙤:  𓂃 ࣪ ִֶָ☾.   @${inactivePlayer.split('@')[0]} (-${penalty} ${global.moneda})\n> 𓂃 ࣪ ִֶָ☾.  📝 𝙈𝙤𝙩𝙞𝙫𝙤: 𝙉𝙤 𝙝𝙪𝙗𝙤 𝙖𝙘𝙩𝙞𝙫𝙞𝙙𝙖𝙙 𝙙𝙪𝙧𝙖𝙣𝙩𝙚 1 𝙢𝙞𝙣𝙪𝙩𝙤`.trim()
      boardStatus = 'timeout'
      boardStatusText = 'Juego cancelado por inactividad'

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
      boardStatus = 'win'
      boardStatusText = `Ganador: ${game.winner.split('@')[0]}`
      highlightCells = game.getWinningCells?.() || null

    } else {
      
      const drawReward = 150

      if (global.db.data.users[game.player1]) {
        global.db.data.users[game.player1].coins = (global.db.data.users[game.player1].coins || 0) + drawReward
      }
      if (global.db.data.users[game.player2]) {
        global.db.data.users[game.player2].coins = (global.db.data.users[game.player2].coins || 0) + drawReward
      }

      message = `╭─╮  𓍯  𝙅𝙐𝙀𝙂𝙊 𝙀𝙈𝙋𝘼𝙏𝘼𝘿𝙊  𓍯
│  𓂃 ࣪ ִֶָ☾.   𝙅𝙪𝙜𝙖𝙙𝙤𝙧𝙚𝙨:
│  𓂃 ࣪ ִֶָ☾.  ❌ @${game.player1.split('@')[0]} (+${drawReward} ${global.moneda})
│  𓂃 ࣪ ִֶָ☾.  ⭕ @${game.player2.split('@')[0]} (+${drawReward} ${global.moneda})
│
│  𓂃 ࣪ ִֶָ☾.   𝙍𝙚𝙨𝙪𝙡𝙩𝙖𝙙𝙤: 𝙉𝙖𝙙𝙞𝙚 𝙜𝙖𝙣ó
│  𓂃 ࣪ ִֶָ☾.  𝙍𝙚𝙘𝙤𝙢𝙥𝙚𝙣𝙨𝙖: +${drawReward} ${global.moneda} cada uno
╰─╯`.trim()
      boardStatus = 'draw'
      boardStatusText = 'Empate — nadie ganó'
    }

    if (reason === 'timeout') {
      playersToMention = [game.player1, game.player2]
    } else if (game.winner) {
      const loser = game.winner === game.player1 ? game.player2 : game.player1
      playersToMention = [game.winner, loser]
    } else {
      playersToMention = [game.player1, game.player2]
    }

    return sendMichiBoard(conn, chatId, game, {
      quoted: m,
      caption: message,
      mentionedJid: playersToMention,
      status: boardStatus,
      statusText: boardStatusText,
      highlightCells,
      winnerJid: game.winner || null,
    })

  } catch (e) {
    console.error('Error al finalizar juego:', e)
  }
}

handler.help = ['michi\n→ Juega 3 en raya mencionando a otro usuario registrado\n→ El oponente debe responder "si" o "no" en 20 segundos']
handler.tags = ['juegos', 'multijugador']
handler.command = ['michi', '3enraya', 'tictactoe', 'ttt']
handler.group = true

export default handler
