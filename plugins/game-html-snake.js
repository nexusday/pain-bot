import { sendHtmlWhatsApp } from '../lib/wa-html.js'
import { htmlSnake } from '../lib/html-games/snake.js'

let handler = async (m, { conn, usedPrefix, command }) => {
  try {
    const nombre = m.pushName || m.name || m.sender?.split('@')[0] || 'Jugador'
    await sendHtmlWhatsApp(conn, m.chat, {
      html: htmlSnake(nombre)
    })
  } catch (e) {
    console.error('[snake html]', e?.message || e)
    return conn.reply(
      m.chat,
      `[❌] No se pudo enviar Snake.\n> ${usedPrefix + command}`,
      m
    )
  }
}

handler.help = ['snake - Juego Snake en el chat']
handler.tags = ['game', 'fun']
handler.command = ['snake', 'serpiente', 'htmlsnake']

export default handler
