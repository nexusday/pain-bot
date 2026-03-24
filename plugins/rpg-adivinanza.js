import fs from 'fs'
import { join } from 'path'

let handler = async (m, { conn, args, usedPrefix, command }) => {
  try {
    let user = global.db.data.users[m.sender]
    if (!user) global.db.data.users[m.sender] = {}
    
    let coins = user.coins || 0
    
    
    const cooldown = 3 * 60 * 1000 
    const lastAdivinanza = user.lastAdivinanza || 0
    const timeLeft = cooldown - (Date.now() - lastAdivinanza)
    
    if (timeLeft > 0) {
      const minutes = Math.floor(timeLeft / 60000)
      const seconds = Math.floor((timeLeft % 60000) / 1000)
      return conn.sendMessage(m.chat, {
        text: `[❗] Debes esperar\n> *${minutes} minuto${minutes !== 1 ? 's' : ''} y ${seconds} segundo${seconds !== 1 ? 's' : ''}* para volver a jugar a las adivinanzas.`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    
    
    const adivinanzasPath = join('./storage/databases/adivinanzas.json')
    let adivinanzas = []
    
    try {
      const adivinanzasData = fs.readFileSync(adivinanzasPath, 'utf8')
      adivinanzas = JSON.parse(adivinanzasData)
    } catch (error) {
      console.error('Error cargando adivinanzas:', error)
      return conn.sendMessage(m.chat, {
        text: '[❌] Error al cargar las adivinanzas. Contacta al administrador.',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    
    
    const adivinanza = adivinanzas[Math.floor(Math.random() * adivinanzas.length)]
    
    
    if (!global.db.data.adivinanzasActivas) global.db.data.adivinanzasActivas = {}
    global.db.data.adivinanzasActivas[m.chat] = {
      pregunta: adivinanza.pregunta,
      respuesta: adivinanza.respuesta.toLowerCase(),
      activa: true,
      creadaPor: m.sender,
      timestamp: Date.now(),
      respondida: false
    }
    
    
    global.db.data.users[m.sender].lastAdivinanza = Date.now()
    
    let txt = `🧩 𝗔𝗗𝗜𝗩𝗜𝗡𝗔𝗡𝗭𝗔𝗦\n> *Pregunta:* ${adivinanza.pregunta}\n> *Premio:* 250-500 ${global.moneda}\n> *Tiempo:* 60s\n> *Categoria:* ${adivinanza.categoria}`
    
    return conn.sendMessage(m.chat, {
      text: txt,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender]
      }
    }, { quoted: m })
    
  } catch (e) {
    console.error('Error en juego de adivinanzas:', e)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error al ejecutar el juego de adivinanzas.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.help = ['#adivinanza\n→ Juega a las adivinanzas cada 3 minutos y gana 250-500 USD si aciertas']
handler.tags = ['juegos', 'economía']
handler.command = ['adivinanza', 'adivinanzas', 'riddle']

export default handler
