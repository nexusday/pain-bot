import fs from 'fs'
import path from 'path'
import { join } from 'path'
import { tr } from '../lib/lang.js'

let handler = async (m, { conn, usedPrefix, command, text, args }) => {
  const botActual = conn.user?.jid?.split('@')[0].replace(/\D/g, '')
  const rutaConfig = join('./Serbot', botActual, 'config.json')

  let nombreBot = global.namebot || 'PAIN BOT'

  if (fs.existsSync(rutaConfig)) {
    try {
      const configuracion = JSON.parse(fs.readFileSync(rutaConfig, 'utf-8'))
      if (configuracion.name) nombreBot = configuracion.name
    } catch (err) {}
  }

  const numeroRemitente = m.sender.replace(/[^0-9]/g, '')
  const rutaBot = path.join('./Serbot', numeroRemitente)

  if (!fs.existsSync(rutaBot)) {
    return conn.reply(m.chat, tr(conn,
      '[❗] No encontré una sesión vinculada a tu número.',
      '[❗] I could not find a session linked to your number.',
      '[❗] Não encontrei uma sessão ligada ao seu número.'
    ), m, rcanal)
  }

  if (!text) return conn.reply(m.chat, tr(conn,
    `*[❗] Ejemplo:* ${usedPrefix}setbotname ${nombreBot}`,
    `*[❗] Example:* ${usedPrefix}setbotname ${nombreBot}`,
    `*[❗] Exemplo:* ${usedPrefix}setbotname ${nombreBot}`
  ), m, rcanal)

  const rutaConfigUsuario = path.join(rutaBot, 'config.json')
  let configuracion = {}

  if (fs.existsSync(rutaConfigUsuario)) {
    try {
      configuracion = JSON.parse(fs.readFileSync(rutaConfigUsuario))
    } catch {}
  }

  configuracion.name = text.trim()

  try {
    fs.writeFileSync(rutaConfigUsuario, JSON.stringify(configuracion, null, 2))
    return conn.reply(m.chat, tr(conn,
      `ִֶָ☾. *Nombre actualizado*\n> ${text.trim()}`,
      `ִֶָ☾. *Name updated*\n> ${text.trim()}`,
      `ִֶָ☾. *Nome atualizado*\n> ${text.trim()}`
    ), m, rcanal)
  } catch {}
}

handler.help = ['setbotname']
handler.tags = ['serbot']
handler.command = ['setbotname']

export default handler
