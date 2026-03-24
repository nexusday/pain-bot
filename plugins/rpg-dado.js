let handler = async (m, { conn, args, usedPrefix, command }) => {
  try {

    let user = global.db.data.users[m.sender]
    if (!user) global.db.data.users[m.sender] = {}

    let coins = user.coins || 0

    const cooldown = 2 * 60 * 1000
    const lastDado = user.lastDado || 0
    const timeLeft = cooldown - (Date.now() - lastDado)

    if (timeLeft > 0) {
      const minutes = Math.floor(timeLeft / 60000)
      const seconds = Math.floor((timeLeft % 60000) / 1000)
      return conn.sendMessage(m.chat, {
        text: `🎲 𝗗𝗔𝗗𝗢\n> Debes esperar ${minutes} minuto${minutes !== 1 ? 's' : ''} y ${seconds} segundo${seconds !== 1 ? 's' : ''} para volver a jugar`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    let dado = Math.floor(Math.random() * 6) + 1

    let perdidaAlta = Math.floor(Math.random() * (1500 - 500 + 1)) + 500
    let perdidaMedia = Math.floor(Math.random() * (1200 - 500 + 1)) + 500

    let gananciaPequena = Math.floor(Math.random() * (400 - 250 + 1)) + 250
    let gananciaMedia = Math.floor(Math.random() * (1200 - 800 + 1)) + 800
    let gananciaAlta = Math.floor(Math.random() * (2500 - 1500 + 1)) + 1500

    let ganancia = 0
    let resultado = ''

    switch (dado) {
      case 1:
        ganancia = -perdidaAlta
        resultado = 'Pérdida total'
        break
      case 2:
        ganancia = -perdidaMedia
        resultado = 'Mala suerte'
        break
      case 3:
        ganancia = -perdidaAlta
        resultado = 'Resultado negativo'
        break
      case 4:
        ganancia = gananciaPequena
        resultado = 'Ganancia pequeña'
        break
      case 5:
        ganancia = gananciaMedia
        resultado = 'Buena tirada'
        break
      case 6:
        ganancia = gananciaAlta
        resultado = 'Jackpot'
        break
    }

    global.db.data.users[m.sender].coins = coins + ganancia
    global.db.data.users[m.sender].lastDado = Date.now()

    const emojisDado = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']

    let txt = `🎲 𝗗𝗔𝗗𝗢\n 
> Dado: ${emojisDado[dado - 1]} (${dado})
> Resultado: ${resultado}
> Cambio: ${ganancia > 0 ? '+' : ''}${ganancia} ${global.moneda}
> Total: ${coins + ganancia} ${global.moneda}

> Próximo intento: 2 minutos`

    return conn.sendMessage(m.chat, {
      text: txt,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender]
      }
    }, { quoted: m })

  } catch (e) {
    console.error('Error en juego del dado:', e)
    return conn.sendMessage(m.chat, {
      text: '❗ Ocurrió un error al ejecutar el juego del dado.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.help = ['#dado\n→ Juega al dado cada 2 minutos']
handler.tags = ['juegos', 'economía']
handler.command = ['dado', 'dice', 'dados']

export default handler