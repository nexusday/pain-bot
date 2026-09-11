import { isMainBotConn } from './modo-sub.js'

const linea = '> 𓂃 ࣪ ִֶָ☾.'

function obtenerClaveAjustesBot(conn) {
  return conn.user?.jid || conn.decodeJid(conn.user?.id)
}

let handler = async (m, { conn, usedPrefix, text, isOwner }) => {
  if (!isOwner) {
    return m.reply('*[❗] Solo los dueños pueden usar este comando.*')
  }

  if (!isMainBotConn(conn)) {
    return conn.reply(
      m.chat,
      `${linea}  Este comando es solo para el *bot principal*.\n\n${linea}  En sub-bots usa *${usedPrefix}setautoread on/off*`,
      m,
      rcanal,
    )
  }

  const claveBot = obtenerClaveAjustesBot(conn)
  if (!claveBot) {
    return conn.reply(m.chat, `${linea}  No se pudo identificar la sesión del bot.`, m, rcanal)
  }

  global.db.data.settings[claveBot] ||= {}
  const ajustes = global.db.data.settings[claveBot]
  if (!('autoread' in ajustes)) ajustes.autoread = true

  if (!text) {
    const estado = ajustes.autoread !== false ? 'Activado ✅' : 'Desactivado ❌'
    return conn.reply(
      m.chat,
      `𓍯 𝚅𝙸𝚂𝚃𝙾 𓍯

${linea}  *Estado:* ${estado}

${linea}  *${usedPrefix}setvist on* — Marcar mensajes como leídos
${linea}  *${usedPrefix}setvist off* — No marcar visto (sin doble check azul)`,
      m,
      rcanal,
    )
  }

  const accion = text.toLowerCase().trim()

  if (accion === 'on' || accion === 'activar' || accion === 'enable') {
    ajustes.autoread = true
    return conn.reply(m.chat, `${linea}  𝚅𝙸𝚂𝚃𝙾 *activado* ✅`, m, rcanal)
  }

  if (accion === 'off' || accion === 'desactivar' || accion === 'disable') {
    ajustes.autoread = false
    return conn.reply(m.chat, `${linea}  𝚅𝙸𝚂𝚃𝙾 *desactivado* ❌`, m, rcanal)
  }

  return conn.reply(
    m.chat,
    `${linea}  Uso: *${usedPrefix}setvist on/off*`,
    m,
    rcanal,
  )
}

handler.help = ['setvist <on/off>']
handler.tags = ['owner']
handler.command = ['setvist', 'setvisto']
handler.rowner = true

export default handler
