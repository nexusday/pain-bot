import fs from 'fs'
import { join } from 'path'

let handler = async (m, { conn, args, usedPrefix, command }) => {
  try {
    let usuario = global.db.data.users[m.sender]
    if (!usuario) global.db.data.users[m.sender] = {}
    
    let monedas = usuario.coins || 0
    
    
    const cooldown = 3 * 60 * 1000 
    const lastAdivinanza = usuario.lastAdivinanza || 0
    const tiempoRestante = cooldown - (Date.now() - lastAdivinanza)
    
    if (tiempoRestante > 0) {
      const minutos = Math.floor(tiempoRestante / 60000)
      const segundos = Math.floor((tiempoRestante % 60000) / 1000)
      return conn.sendMessage(m.chat, {
        text: `[❗] Debes esperar ${minutos} minuto${minutos !== 1 ? 's' : ''} y ${segundos} segundo${segundos !== 1 ? 's' : ''} para volver a jugar.`,
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
        text: '[❌] Error al cargar las adivinanzas.',
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
    
    let texto = `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *${adivinanza.pregunta}*
╰─ ✧  ✩
┊ ${adivinanza.categoria || '—'}
┊ premio  ·  \`250-500 ${global.moneda}\`
┊ tiempo  ·  \`60s\`
╰─────────`.trim()
    
    return conn.sendMessage(m.chat, {
      text: texto,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender]
      }
    }, { quoted: m })
    
  } catch (error) {
    console.error('Error en juego de adivinanzas:', error)
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
