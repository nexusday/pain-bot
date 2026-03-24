
const symbols = ['🍎', '🍊', '🍇', '🍒', '💎', '⭐', '🎰']
const multipliers = {
  '🍎': 2,   
  '🍊': 2,   
  '🍇': 3,  
  '🍒': 3,   
  '💎': 4,   
  '⭐': 4,   
  '🎰': 5    
}

const cooldownTime = 30000

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

    
    let user = global.db.data.users[m.sender]
    if (!user) {
      global.db.data.users[m.sender] = {
        coins: 100,
        exp: 0,
        level: 0,
        registered: true,
        name: m.name || m.pushName || 'Usuario'
      }
      user = global.db.data.users[m.sender]
    }

    
    if (!user.lastSlotPlay) user.lastSlotPlay = 0
    const timeSinceLastPlay = Date.now() - user.lastSlotPlay

    if (timeSinceLastPlay < cooldownTime) {
      const seconds = Math.ceil((cooldownTime - timeSinceLastPlay) / 1000)
      return conn.sendMessage(m.chat, {
        text: `[❗] Debes esperar *${seconds} segundo${seconds !== 1 ? 's' : ''}* para volver a jugar.`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    
    const bet = parseInt(args[0])
    if (!bet || isNaN(bet) || bet < 50) {
      return conn.sendMessage(m.chat, {
        text: `[❗] Apuesta mínima: 50 ${global.moneda}\n> Uso: ${usedPrefix + command} <cantidad>`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    
    if ((user.coins || 0) < bet) {
      return conn.sendMessage(m.chat, {
        text: `[❌] No tienes suficientes ${global.moneda}.\n> Tienes: ${user.coins || 0} ${global.moneda}`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    
    user.lastSlotPlay = Date.now()
    user.coins -= bet

    
    const result = generateSlotResult()
    const { reels, winType, multiplier, symbols: resultSymbols } = result

    
    let winnings = 0
    let resultado = ''
    let emoji = ''

    if (winType === 'jackpot') {
      winnings = bet * multiplier
      resultado = `🎰 *¡JACKPOT!* Premio x${multiplier}`
      emoji = '🎉'
    } else if (winType === 'big_win') {
      winnings = bet * multiplier
      resultado = `✅ *¡Ganaste!* Premio x${multiplier}`
      emoji = '🎊'
    } else if (winType === 'win') {
      winnings = Math.floor(bet * multiplier)
      resultado = `😊 *¡Bien!* Premio x${multiplier.toFixed(1)}`
      emoji = '✨'
    } else {
      winnings = 0
      resultado = `❌ *¡Perdiste!* Suerte para la próxima`
      emoji = '💸'
    }

    
    user.coins += winnings

    
    let txt = `🎰 𝗔𝗣𝗨𝗘𝗦𝗧𝗔𝗦  🎰\n`
    txt += `\n`
    txt += `${reels}\n`
    txt += `\n\n> ${resultado}\n> *Premio:* ${winnings > 0 ? '+' : ''}${winnings} ${global.moneda}\n> *Total:* ${user.coins} ${global.moneda}\n> *Próximo:* 30 seg\n`

    return conn.sendMessage(m.chat, {
      text: txt,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })

  } catch (e) {
    console.error('Error en slot:', e)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error al ejecutar el juego.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}


function generateSlotResult() {

  
  const rand = Math.random()

  let resultSymbols = []
  let winType = 'lose'
  let multiplier = 1

  if (rand < 0.03) { 
    const jackpotSymbols = ['💎', '⭐', '🎰']
    const jackpotSymbol = jackpotSymbols[Math.floor(Math.random() * jackpotSymbols.length)]
    resultSymbols = [jackpotSymbol, jackpotSymbol, jackpotSymbol]
    winType = 'jackpot'
    multiplier = multipliers[jackpotSymbol]
  } else if (rand < 0.15) { 
    const winSymbol = symbols[Math.floor(Math.random() * symbols.length)]
    resultSymbols = [winSymbol, winSymbol, winSymbol]
    winType = 'big_win'
    multiplier = multipliers[winSymbol]
  } else if (rand < 0.50) { 
    const winSymbol = symbols[Math.floor(Math.random() * symbols.length)]
    let loseSymbol
    do {
      loseSymbol = symbols[Math.floor(Math.random() * symbols.length)]
    } while (loseSymbol === winSymbol) 

    
    const positions = Math.floor(Math.random() * 3) 
    if (positions === 0) {
      resultSymbols = [winSymbol, winSymbol, loseSymbol]
    } else if (positions === 1) {
      resultSymbols = [loseSymbol, winSymbol, winSymbol]
    } else {
      resultSymbols = [winSymbol, loseSymbol, winSymbol]
    }
    winType = 'win'
    multiplier = Math.floor(multipliers[winSymbol] * 0.6) 
  } else { 
    resultSymbols = []
    for (let i = 0; i < 3; i++) {
      resultSymbols.push(symbols[Math.floor(Math.random() * symbols.length)])
    }
    winType = 'lose'
    multiplier = 0
  }

  return {
    reels: `╔═══╦═══╦═══╗
║ ${resultSymbols[0]} ║ ${resultSymbols[1]} ║ ${resultSymbols[2]} ║
╚═══╩═══╩═══╝`,
    winType,
    multiplier,
    symbols: resultSymbols
  }
}

handler.help = ['slot', 'slots', 'apostar']
handler.tags = ['juegos', 'economía']
handler.command = ['slot', 'slots', 'apostar']

export default handler
