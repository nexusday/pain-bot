import { idiomaDe, tr } from '../lib/lang.js'
import { listarBancoAdivinanzas } from '../lib/banco-adivinanzas.js'

let handler = async (m, { conn, args, usedPrefix, command }) => {
  try {
    let usuario = global.db.data.users[m.sender]
    if (!usuario) usuario = global.db.data.users[m.sender] = {}
    
    
    const cooldown = 3 * 60 * 1000 
    const lastAdivinanza = usuario.lastAdivinanza || 0
    const tiempoRestante = cooldown - (Date.now() - lastAdivinanza)
    
    if (tiempoRestante > 0) {
      const minutos = Math.floor(tiempoRestante / 60000)
      const segundos = Math.floor((tiempoRestante % 60000) / 1000)
      const espera = tr(conn,
        `[❗] Debes esperar ${minutos} minuto${minutos !== 1 ? 's' : ''} y ${segundos} segundo${segundos !== 1 ? 's' : ''} para volver a jugar.`,
        `[❗] Wait ${minutos} minute${minutos !== 1 ? 's' : ''} and ${segundos} second${segundos !== 1 ? 's' : ''} to play again.`,
        `[❗] Espera ${minutos} minuto${minutos !== 1 ? 's' : ''} e ${segundos} segundo${segundos !== 1 ? 's' : ''} para jogar outra vez.`
      )
      return conn.sendMessage(m.chat, {
        text: espera,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    const lang = idiomaDe(conn)
    const adivinanzas = listarBancoAdivinanzas()
    const item = adivinanzas[Math.floor(Math.random() * adivinanzas.length)]
    const pregunta = item.pregunta[lang] || item.pregunta.es
    const respuestas = item.respuesta[lang] || item.respuesta.es
    const categoria = item.categoria[lang] || item.categoria.es
    const adivinanza = { pregunta, categoria, respuesta: respuestas[0], respuestas }

    if (!global.db.data.adivinanzasActivas) global.db.data.adivinanzasActivas = {}
    global.db.data.adivinanzasActivas[m.chat] = {
      pregunta,
      respuesta: respuestas[0],
      respuestas,
      activa: true,
      creadaPor: m.sender,
      timestamp: Date.now(),
      respondida: false
    }
    
    
    global.db.data.users[m.sender].lastAdivinanza = Date.now()
    
    const premioLbl = tr(conn, 'premio', 'prize', 'prémio')
    const tiempoLbl = tr(conn, 'tiempo', 'time', 'tempo')
    let texto = `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *${adivinanza.pregunta}*
╰─ ✧  ✩
┊ ${adivinanza.categoria || '—'}
┊ ${premioLbl}  ·  \`250-500 ${global.moneda}\`
┊ ${tiempoLbl}  ·  \`60s\`
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
      text: tr(conn,
        '[❌] Ocurrió un error al ejecutar el juego de adivinanzas.',
        '[❌] The riddle game failed.',
        '[❌] O jogo de adivinhas falhou.'
      ),
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
