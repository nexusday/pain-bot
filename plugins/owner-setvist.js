import { isMainBotConn } from './modo-sub.js'

const line = '> 𓂃 ࣪ ִֶָ☾.'

function getBotSettingsKey(conn) {
  return conn.user?.jid || conn.decodeJid(conn.user?.id)
}

let handler = async (m, { conn, usedPrefix, text, isOwner }) => {
  if (!isOwner) {
    return m.reply('*[❗] Solo los dueños pueden usar este comando.*')
  }

  if (!isMainBotConn(conn)) {
    return conn.reply(
      m.chat,
      `${line}  Este comando es solo para el *bot principal*.\n\n${line}  En sub-bots usa *${usedPrefix}setautoread on/off*`,
      m,
      rcanal,
    )
  }

  const botKey = getBotSettingsKey(conn)
  if (!botKey) {
    return conn.reply(m.chat, `${line}  No se pudo identificar la sesión del bot.`, m, rcanal)
  }

  global.db.data.settings[botKey] ||= {}
  const settings = global.db.data.settings[botKey]
  if (!('autoread' in settings)) settings.autoread = true

  if (!text) {
    const status = settings.autoread !== false ? 'Activado ✅' : 'Desactivado ❌'
    return conn.reply(
      m.chat,
      `𓍯 𝚅𝙸𝚂𝚃𝙾 𓍯

${line}  *Estado:* ${status}

${line}  *${usedPrefix}setvist on* — Marcar mensajes como leídos
${line}  *${usedPrefix}setvist off* — No marcar visto (sin doble check azul)`,
      m,
      rcanal,
    )
  }

  const action = text.toLowerCase().trim()

  if (action === 'on' || action === 'activar' || action === 'enable') {
    settings.autoread = true
    return conn.reply(m.chat, `${line}  𝚅𝙸𝚂𝚃𝙾 *activado* ✅`, m, rcanal)
  }

  if (action === 'off' || action === 'desactivar' || action === 'disable') {
    settings.autoread = false
    return conn.reply(m.chat, `${line}  𝚅𝙸𝚂𝚃𝙾 *desactivado* ❌`, m, rcanal)
  }

  return conn.reply(
    m.chat,
    `${line}  Uso: *${usedPrefix}setvist on/off*`,
    m,
    rcanal,
  )
}

handler.help = ['setvist <on/off>']
handler.tags = ['owner']
handler.command = ['setvist', 'setvisto']
handler.rowner = true

export default handler
