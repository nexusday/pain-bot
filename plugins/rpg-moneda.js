
const cooldownTime = 15000


function calculateProbability(bet) {
  if (bet <= 200) return 0.5  
  if (bet <= 500) return 0.4  
  if (bet <= 1000) return 0.3
  return 0.2 
}


function getCoinFlipResult(bet) {
  const probability = calculateProbability(bet)
  const rand = Math.random()

  
  return rand < probability
}

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

    
    let usuario = global.db.data.users[m.sender]
    if (!usuario) {
      global.db.data.users[m.sender] = {
        coins: 100,
        exp: 0,
        level: 0,
        registered: true,
        name: m.name || m.pushName || 'Usuario'
      }
      usuario = global.db.data.users[m.sender]
    }

    
    if (!usuario.lastCoinFlip) usuario.lastCoinFlip = 0
    const timeSinceLastPlay = Date.now() - usuario.lastCoinFlip

    if (timeSinceLastPlay < cooldownTime) {
      const segundos = Math.ceil((cooldownTime - timeSinceLastPlay) / 1000)
      return conn.sendMessage(m.chat, {
        text: `[❗] Debes esperar *${segundos} segundo${segundos !== 1 ? 's' : ''}* para volver a jugar.`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    
    const choice = args[0]?.toLowerCase()
    const bet = parseInt(args[1])

    if (!choice || !['cara', 'sello', 'coin', 'flip'].includes(choice)) {
      return conn.sendMessage(m.chat, {
        text: `[❌] Uso correcto: ${usedPrefix + command} <cara/sello> <cantidad>\nEjemplo: ${usedPrefix + command} cara 100`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    if (!bet || isNaN(bet) || bet < 50) {
      return conn.sendMessage(m.chat, {
        text: `[❗] Apuesta mínima: 50 ${global.moneda}`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    
    if ((usuario.coins || 0) < bet) {
      return conn.sendMessage(m.chat, {
        text: `[❗] No tienes suficientes ${global.moneda}.\nTienes: ${usuario.coins || 0} ${global.moneda}`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    
    usuario.lastCoinFlip = Date.now()
    usuario.coins -= bet

    
    const userWon = getCoinFlipResult(bet)
    const probability = calculateProbability(bet)
    const resultEmoji = userWon ? (choice === 'cara' ? '🪙' : '🪙') : (choice === 'cara' ? '🪙' : '🪙')
    const resultText = userWon ? (choice === 'cara' ? 'CARA' : 'SELLO') : (choice === 'cara' ? 'SELLO' : 'CARA')

    
    let winnings = 0
    let resultado = ''

    if (userWon) {
      winnings = bet * 2 
      usuario.coins += winnings
      resultado = `🎉 ¡GANASTE! ${choice.toUpperCase()} salió!`
    } else {
      winnings = 0
      resultado = `💸 ¡PERDISTE! Salió ${resultText}`
    }

    
    let riskMessage = ''
    if (bet <= 200) {
      riskMessage = 'Jugaste seguro, ¡bien hecho!'
    } else if (bet <= 500) {
      riskMessage = '¡Apuesta arriesgada!'
    } else if (bet <= 1000) {
      riskMessage = '¡Qué valentía! 💪'
    } else {
      riskMessage = '¡Apuesta extrema! 🔥'
    }

    
    let texto = `🪙 𝗖𝗮𝗿𝗮 𝗼 𝘀𝗲𝗹𝗹𝗼 \n`
    texto += `\n`
    texto += `> ${resultEmoji} *Resultado:* ${resultText}\n`
    texto += `> *Elegiste:* ${choice.toUpperCase()}\n`
    texto += `> ${resultado}\n`
    texto += `> *Apuesta:* ${bet} ${global.moneda}\n`
    texto += `> *Premio:* ${winnings > 0 ? '+' : ''}${winnings} ${global.moneda}\n`
    texto += `> *Total:* ${usuario.coins} ${global.moneda}\n`
    texto += `\n`
    texto += `> ${riskMessage}\n`
    texto += `> *Probabilidad:* ${Math.round(probability * 100)}%\n`
    texto += `> *Próximo:* 15 seg\n`

    return conn.sendMessage(m.chat, {
      text: texto,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })

  } catch (error) {
    console.error('Error en cara-sello:', error)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error al ejecutar el juego.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.help = ['moneda', 'cara', 'sello']
handler.tags = ['juegos', 'economía']
handler.command = ['moneda']

export default handler
