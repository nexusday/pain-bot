import { asegurarMapaJuegos, establecerJuegos, juegosActivados } from '../lib/Modos/modo-games.js'

let handler = async (m, { conn, args, usedPrefix, command }) => {
  try {
    if (!m.isGroup) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Este comando solo funciona en grupos.',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const accion = String(args[0] || '').toLowerCase()
    asegurarMapaJuegos()

    if (accion === 'on') {
      establecerJuegos(m.chat, true)
      await global.db.write()

      return conn.sendMessage(m.chat, {
        text: `🎮 *Juegos activados*\n\n> Todos los comandos del menú de juegos vuelven a funcionar.\n> *Por:* @${m.sender.split('@')[0]}`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
    }

    if (accion === 'off') {
      establecerJuegos(m.chat, false)
      // Cancela partidas en curso para efecto inmediato.
      try {
        if (global.games?.[m.chat]) delete global.games[m.chat]
        if (global.pendingInvites?.[m.chat]) delete global.pendingInvites[m.chat]
        if (global.db?.data?.adivinanzasActivas?.[m.chat]) {
          delete global.db.data.adivinanzasActivas[m.chat]
        }
      } catch {}
      await global.db.write()

      return conn.sendMessage(m.chat, {
        text: `🎮 *Juegos desactivados*\n\n> Ningún comando del menú de juegos funcionará aquí.\n> *Por:* @${m.sender.split('@')[0]}`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
    }

    const estado = juegosActivados(m.chat) ? 'activados' : 'desactivados'

    return conn.sendMessage(m.chat, {
      text: `[❗] Uso: ${usedPrefix + command} on/off\n\n> *Estado actual:* ${estado}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (error) {
    console.error('Error en games:', error)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error al configurar los juegos.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.command = ['games', 'juegos', 'modogames', 'modojuegos']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler
