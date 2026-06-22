const cooldownTime = 25000

const ROJO = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])
const NEGRO = new Set([2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35])

function spinRoulette() {
  return Math.floor(Math.random() * 37)
}

function colorOf(num) {
  if (num === 0) return 'verde'
  if (ROJO.has(num)) return 'rojo'
  return 'negro'
}

function parseBet(choiceRaw) {
  const choice = String(choiceRaw || '').toLowerCase().trim()

  if (['rojo', 'roja', 'red', 'r'].includes(choice)) {
    return { type: 'color', value: 'rojo', label: 'ROJO', multiplier: 2 }
  }
  if (['negro', 'negra', 'black', 'n'].includes(choice)) {
    return { type: 'color', value: 'negro', label: 'NEGRO', multiplier: 2 }
  }
  if (['par', 'even', 'p'].includes(choice)) {
    return { type: 'parity', value: 'par', label: 'PAR', multiplier: 2 }
  }
  if (['impar', 'odd', 'i'].includes(choice)) {
    return { type: 'parity', value: 'impar', label: 'IMPAR', multiplier: 2 }
  }

  const num = parseInt(choice, 10)
  if (!isNaN(num) && num >= 0 && num <= 36) {
    return { type: 'number', value: num, label: String(num), multiplier: 35 }
  }

  return null
}

function checkWin(bet, result) {
  if (result === 0) {
    if (bet.type === 'number' && bet.value === 0) return true
    return false
  }

  if (bet.type === 'number') return bet.value === result
  if (bet.type === 'color') return colorOf(result) === bet.value
  if (bet.type === 'parity') {
    const isEven = result % 2 === 0
    return bet.value === 'par' ? isEven : !isEven
  }

  return false
}

function getWinProbability(bet) {
  if (bet.type === 'number') {
    return 0.01 + Math.random() * 0.02
  }
  return 0.01 + Math.random() * 0.29
}

function pickWinningNumber(bet) {
  if (bet.type === 'number') return bet.value

  if (bet.type === 'color') {
    const pool = bet.value === 'rojo' ? [...ROJO] : [...NEGRO]
    return pool[Math.floor(Math.random() * pool.length)]
  }

  const pool = []
  for (let n = 1; n <= 36; n++) {
    const isEven = n % 2 === 0
    if (bet.value === 'par' ? isEven : !isEven) pool.push(n)
  }
  return pool[Math.floor(Math.random() * pool.length)]
}

function pickLosingNumber(bet) {
  for (let i = 0; i < 60; i++) {
    const n = spinRoulette()
    if (!checkWin(bet, n)) return n
  }
  return bet.type === 'number' && bet.value === 0 ? 1 : 0
}

function resolveSpin(bet) {
  const winChance = getWinProbability(bet)
  const won = Math.random() < winChance
  const result = won ? pickWinningNumber(bet) : pickLosingNumber(bet)
  return { result, won }
}

function resultDisplay(num) {
  const c = colorOf(num)
  const emoji = c === 'verde' ? '🟢' : c === 'rojo' ? '🔴' : '⚫'
  return `${emoji} *${num}* (${c.toUpperCase()})`
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  try {
    if (!m.isGroup) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Este comando solo puede ser usado en grupos.',
        contextInfo: { ...rcanal.contextInfo }
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

    if (!user.lastRuleta) user.lastRuleta = 0
    const timeSinceLastPlay = Date.now() - user.lastRuleta

    if (timeSinceLastPlay < cooldownTime) {
      const seconds = Math.ceil((cooldownTime - timeSinceLastPlay) / 1000)
      return conn.sendMessage(m.chat, {
        text: `[❗] Debes esperar *${seconds} segundo${seconds !== 1 ? 's' : ''}* para volver a jugar.`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const betInfo = parseBet(args[0])
    const amount = parseInt(args[1])

    if (!betInfo) {
      return conn.sendMessage(m.chat, {
        text: `[❗] *Ruleta europea (0-36)*\n\n> Uso: ${usedPrefix + command} <apuesta> <cantidad>\n\n> *Apuestas:*\n> • \`rojo\` / \`negro\` → x2\n> • \`par\` / \`impar\` → x2\n> • \`0\` a \`36\` (número) → x35\n\n> Ejemplo: ${usedPrefix + command} rojo 200`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    if (!amount || isNaN(amount) || amount < 50) {
      return conn.sendMessage(m.chat, {
        text: `[❗] Apuesta mínima: 50 ${global.moneda}`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    if ((user.coins || 0) < amount) {
      return conn.sendMessage(m.chat, {
        text: `[❌] No tienes suficientes ${global.moneda}.\n> Tienes: ${user.coins || 0} ${global.moneda}`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    user.lastRuleta = Date.now()
    user.coins -= amount

    const { result, won } = resolveSpin(betInfo)
    const winnings = won ? amount * betInfo.multiplier : 0

    if (winnings > 0) user.coins += winnings

    const txt = `🎡 *RULETA*

> Apuesta: *${betInfo.label}* — ${amount} ${global.moneda}
Resultado: ${resultDisplay(result)}

${won ? `✅ *¡Ganaste!* +${winnings} ${global.moneda} (x${betInfo.multiplier})` : `❌ *Perdiste* —${amount} ${global.moneda}`}

Total: ${user.coins} ${global.moneda}
> Próximo giro: 25 seg`

    return conn.sendMessage(m.chat, {
      text: txt,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (e) {
    console.error('Error en ruleta:', e)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error al ejecutar la ruleta.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['ruleta <rojo/negro/par/impar/0-36> <cantidad>']
handler.tags = ['juegos', 'economía']
handler.command = ['ruleta', 'roulette', 'rule']

export default handler
