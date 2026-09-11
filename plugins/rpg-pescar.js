let handler = async (m, { conn, args, usedPrefix, command }) => {
  try {
    let usuario = global.db.data.users[m.sender]
    if (!usuario) global.db.data.users[m.sender] = {}

    let monedas = usuario.coins || 0

    
    const cooldown = 2 * 60 * 1000
    const lastPescar = usuario.lastPescar || 0
    const tiempoRestante = cooldown - (Date.now() - lastPescar)

    if (tiempoRestante > 0) {
      const minutos = Math.floor(tiempoRestante / 60000)
      const segundos = Math.floor((tiempoRestante % 60000) / 1000)
      return conn.sendMessage(m.chat, {
        text: `[❗] Debes esperar *${minutos} minuto${minutos !== 1 ? 's' : ''} y ${segundos} segundo${segundos !== 1 ? 's' : ''}* para volver a pescar.`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    
    const pescados = [
    
      { nombre: '🐟 Pececillo', valor: Math.floor(Math.random() * (200 - 150 + 1)) + 150, emoji: '🐟', rareza: 'Común' },
      { nombre: '🐠 Pez Payaso', valor: Math.floor(Math.random() * (200 - 150 + 1)) + 150, emoji: '🐠', rareza: 'Común' },
      { nombre: '🦐 Camarón', valor: Math.floor(Math.random() * (200 - 150 + 1)) + 150, emoji: '🦐', rareza: 'Común' },
      { nombre: '🦞 Langosta', valor: Math.floor(Math.random() * (200 - 150 + 1)) + 150, emoji: '🦞', rareza: 'Común' },
      { nombre: '🐡 Pez Globo', valor: Math.floor(Math.random() * (200 - 150 + 1)) + 150, emoji: '🐡', rareza: 'Común' },

      
      { nombre: '🐙 Pulpo', valor: Math.floor(Math.random() * (300 - 250 + 1)) + 250, emoji: '🐙', rareza: 'Poco Común' },
      { nombre: '🦑 Calamar', valor: Math.floor(Math.random() * (300 - 250 + 1)) + 250, emoji: '🦑', rareza: 'Poco Común' },
      { nombre: '🦀 Cangrejo', valor: Math.floor(Math.random() * (300 - 250 + 1)) + 250, emoji: '🦀', rareza: 'Poco Común' },
      { nombre: '🐢 Tortuga Marina', valor: Math.floor(Math.random() * (300 - 250 + 1)) + 250, emoji: '🐢', rareza: 'Poco Común' },

      
      { nombre: '🦈 Tiburón', valor: Math.floor(Math.random() * (400 - 350 + 1)) + 350, emoji: '🦈', rareza: 'Raro' },
      { nombre: '🐬 Delfín', valor: Math.floor(Math.random() * (400 - 350 + 1)) + 350, emoji: '🐬', rareza: 'Raro' },
      { nombre: '🦭 Foca', valor: Math.floor(Math.random() * (400 - 350 + 1)) + 350, emoji: '🦭', rareza: 'Raro' },

      
      { nombre: '🐋 Ballena', valor: Math.floor(Math.random() * (600 - 450 + 1)) + 450, emoji: '🐋', rareza: 'Épico' },
      { nombre: '🦭 León Marino', valor: Math.floor(Math.random() * (600 - 450 + 1)) + 450, emoji: '🦭', rareza: 'Épico' },

      
      { nombre: '🦕 Megalodón', valor: Math.floor(Math.random() * (1150 - 800 + 1)) + 800, emoji: '🦕', rareza: 'Legendario' },
      { nombre: '🐉 Dragón Marino', valor: Math.floor(Math.random() * (1150 - 800 + 1)) + 800, emoji: '🐉', rareza: 'Legendario' }
    ]

    
    const rand = Math.random() * 100

    let pescado
    if (rand < 10) {
      
      pescado = null
    } else if (rand < 60) {
      
      const comunes = pescados.filter(p => p.rareza === 'Común')
      pescado = comunes[Math.floor(Math.random() * comunes.length)]
    } else if (rand < 82) {
      
      const pocoComunes = pescados.filter(p => p.rareza === 'Poco Común')
      pescado = pocoComunes[Math.floor(Math.random() * pocoComunes.length)]
    } else if (rand < 92) {
      
      const raros = pescados.filter(p => p.rareza === 'Raro')
      pescado = raros[Math.floor(Math.random() * raros.length)]
    } else if (rand < 98) {
      
      const epicos = pescados.filter(p => p.rareza === 'Épico')
      pescado = epicos[Math.floor(Math.random() * epicos.length)]
    } else {
      
      const legendarios = pescados.filter(p => p.rareza === 'Legendario')
      pescado = legendarios[Math.floor(Math.random() * legendarios.length)]
    }

    
    if (pescado) {
      
      global.db.data.users[m.sender].coins = monedas + pescado.valor
      global.db.data.users[m.sender].lastPescar = Date.now()

      
      let mensajeRareza = ''
      switch (pescado.rareza) {
        case 'Común':
          mensajeRareza = '🎣 *¡Buena pesca!*'
          break
        case 'Poco Común':
          mensajeRareza = '🎣 *¡Pesca decente!*'
          break
        case 'Raro':
          mensajeRareza = '🎉 *¡Excelente pesca!*'
          break
        case 'Épico':
          mensajeRareza = '🏆 *¡PESCA ÉPICA!*'
          break
        case 'Legendario':
          mensajeRareza = '👑 *¡PESCA LEGENDARIA!*'
          break
      }

      let texto = `🎣 𝗣𝗲𝘀𝗰𝗮𝗿\n`
      texto += `\n`
      texto += `> ${mensajeRareza}\n`
      texto += `> *Pez capturado:* ${pescado.nombre} ${pescado.emoji}\n`
      texto += `> *Valor:* +${pescado.valor} ${global.moneda}\n`
      texto += `> *Total:* ${monedas + pescado.valor} ${global.moneda}\n`
      texto += `> *Rareza:* ${pescado.rareza}\n`

      return conn.sendMessage(m.chat, {
        text: texto,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
    } else {
      
      global.db.data.users[m.sender].lastPescar = Date.now()

      let texto = `🎣 𝗣𝗲𝘀𝗰𝗮𝗿 \n> *No pescaste nada esta vez*\n> *Total:* ${monedas} ${global.moneda}`

      return conn.sendMessage(m.chat, {
        text: texto,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
    }

  } catch (error) {
    console.error('Error en juego de pescar:', error)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error al pescar. Contacta al administrador.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.help = ['#pescar\n→ Pesca peces aleatorios cada 2 minutos. Premios: 150-500 USD. 10% chance de no pescar nada']
handler.tags = ['juegos', 'economía']
handler.command = ['pescar', 'fish', 'fishing']

export default handler
