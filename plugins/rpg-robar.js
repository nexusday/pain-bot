
const cooldownRobo = 10 * 60 * 1000 
const multaRoboFallido = 25 
const probabilidadRoboExitoso = 0.65 


function getUserName(userId) {
  if (!userId || typeof userId !== 'string') return 'Usuario'
  try {
    return userId.split('@')[0] || 'Usuario'
  } catch (error) {
    return 'Usuario'
  }
}

let handler = async (m, { conn, usedPrefix, command }) => {
  try {
    if (!m.isGroup) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Este comando solo puede ser usado en grupos.',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    
    if (!m.mentionedJid || m.mentionedJid.length === 0) {
      return conn.sendMessage(m.chat, {
        text: `[❗] Debes mencionar a quien quieres robar.\nEjemplo: ${usedPrefix + command} @usuario`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const victima = m.mentionedJid[0]
    const ladron = m.sender

    
    if (victima === ladron) {
      return conn.sendMessage(m.chat, {
        text: '[❌] No puedes robarte a ti mismo.',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    
    let userLadron = global.db.data.users[ladron]
    if (!userLadron) {
      global.db.data.users[ladron] = {
        coins: 100,
        exp: 0,
        level: 0,
        registered: true,
        name: m.name || m.pushName || 'Usuario'
      }
      userLadron = global.db.data.users[ladron]
    }

    
    let userVictima = global.db.data.users[victima]
    if (!userVictima) {
      global.db.data.users[victima] = {
        coins: 100,
        exp: 0,
        level: 0,
        registered: true,
        name: 'Usuario'
      }
      userVictima = global.db.data.users[victima]
    }

    if (!userLadron.banco) userLadron.banco = null
    if (!userLadron.bancoDinero) userLadron.bancoDinero = 0
    if (!userVictima.banco) userVictima.banco = null
    if (!userVictima.bancoDinero) userVictima.bancoDinero = 0

    
    if (!userLadron.lastRobo) userLadron.lastRobo = 0
    const timeSinceLastRobo = Date.now() - userLadron.lastRobo

    if (timeSinceLastRobo < cooldownRobo) {
      const minutos = Math.ceil((cooldownRobo - timeSinceLastRobo) / 60000)
      return conn.sendMessage(m.chat, {
        text: `[❗] Debes esperar *${minutos} minuto${minutos !== 1 ? 's' : ''}* para volver a robar.`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    
    if (userVictima.coins <= 0) {
      
      if (userVictima.bancoDinero > 0) {
        return conn.sendMessage(m.chat, {
          text: `DINERO PROTEGIDO\n\n> El dinero de @${getUserName(victima)} está protegido en ${userVictima.banco ? global.bancos[userVictima.banco].nombre : 'su banco'}\n> No puedes robar dinero que está en el banco`,
          contextInfo: {
            ...rcanal.contextInfo,
            mentionedJid: [victima]
          }
        }, { quoted: m })
      }

      
      userLadron.lastRobo = Date.now()

      
      let multa = multaRoboFallido
      if (userLadron.coins < multa) multa = userLadron.coins
      if (multa > 0) userLadron.coins -= multa

      let texto = `ROBO FALLIDO\n\n`
      texto += `> Ladrón: @${getUserName(ladron)}\n`
      texto += `> Víctima: @${getUserName(victima)}\n\n`
      texto += `> Multa: -${multa} ${global.moneda}\n`
      texto += `> Total: ${userLadron.coins} ${global.moneda}`

      return conn.sendMessage(m.chat, {
        text: texto,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [ladron, victima]
        }
      }, { quoted: m })
    }

    
    userLadron.lastRobo = Date.now()


    const roboExitoso = Math.random() < probabilidadRoboExitoso

    if (roboExitoso) {
      
      let cantidadRobada = Math.floor(userVictima.coins * 0.2) 

      
      if (userVictima.coins <= 100) cantidadRobada = Math.floor(userVictima.coins * 0.15)
      else if (userVictima.coins <= 500) cantidadRobada = Math.floor(userVictima.coins * 0.18)
      else if (userVictima.coins <= 1000) cantidadRobada = Math.floor(userVictima.coins * 0.20)
      else cantidadRobada = Math.floor(userVictima.coins * 0.15) 

      
      if (cantidadRobada < 1) cantidadRobada = 1

    
      userVictima.coins -= cantidadRobada
      userLadron.coins += cantidadRobada

      let texto = `ROBO EXITOSO\n\n`
      texto += `> Ladrón: @${getUserName(ladron)}\n`
      texto += `> Víctima: @${getUserName(victima)}\n\n`
      texto += `> Robado: ${cantidadRobada} ${global.moneda}\n`
      texto += `> Víctima queda con: ${userVictima.coins} ${global.moneda}\n`
      texto += `> Ladrón tiene: ${userLadron.coins} ${global.moneda}`

      return conn.sendMessage(m.chat, {
        text: texto,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [ladron, victima]
        }
      }, { quoted: m })

    } else {
      
      let multa = Math.floor(userLadron.coins * 0.1) 
      if (multa < multaRoboFallido) multa = multaRoboFallido
      if (userLadron.coins < multa) multa = userLadron.coins
      if (multa > 0) userLadron.coins -= multa

      let texto = `ROBO FALLIDO\n\n`
      texto += `> Ladrón: @${getUserName(ladron)}\n`
      texto += `> Víctima: @${getUserName(victima)}\n\n`
      texto += `> Multa: -${multa} ${global.moneda}\n`
      texto += `> Total: ${userLadron.coins} ${global.moneda}\n\n`

      return conn.sendMessage(m.chat, {
        text: texto,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [ladron, victima]
        }
      }, { quoted: m })
    }

  } catch (error) {
    console.error('Error en robo:', error)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error en el sistema de robo.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['robar', 'rob', 'steal']
handler.tags = ['juegos', 'economía', 'rpg']
handler.command = ['robar', 'rob', 'steal']

export default handler
