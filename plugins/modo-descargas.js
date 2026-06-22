import { ensureModoDescargasDb } from '../lib/Modos/modo-descargas.js'

let handler = async (m, { conn, args, usedPrefix, command }) => {
  try {
    if (!m.isGroup) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Este comando solo funciona en grupos.',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const action = args[0]?.toLowerCase()
    ensureModoDescargasDb()

    if (action === 'on') {
      global.db.data.modoDescargas[m.chat] = true
      await global.db.write()

      return conn.sendMessage(m.chat, {
        text: `ִֶָ☾. *Modo descargas activado*

> El bot descargará automáticamente links de *TikTok* e *Instagram* que envíen los miembros.
> Con *antilink* activo, esos links no serán sancionados.
> *Por:* @${m.sender.split('@')[0]}`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
    }

    if (action === 'off') {
      global.db.data.modoDescargas[m.chat] = false
      await global.db.write()

      return conn.sendMessage(m.chat, {
        text: `ִֶָ☾. *Modo descargas desactivado*

> Ya no se descargarán links automáticamente.
> *Por:* @${m.sender.split('@')[0]}`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
    }

    const estado = global.db.data.modoDescargas[m.chat] === true ? 'activado' : 'desactivado'

    return conn.sendMessage(m.chat, {
      text: `[❗] Uso: ${usedPrefix + command} on/off

> *Estado actual:* ${estado}

> *On:* descarga automática de TikTok e Instagram
> *Off:* sin descarga automática`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (e) {
    console.error('Error en mododescargas:', e)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error al configurar el modo descargas.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}


handler.command = ['mododescargas', 'modolinks', 'autodl']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler
