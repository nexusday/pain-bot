import fs from 'fs'
import path from 'path'
import { join } from 'path'

let handler = async (m, { conn, usedPrefix, command, text, args }) => {
  const botActual = conn.user?.jid?.split('@')[0].replace(/\D/g, '')
  const configPath = join('./Serbot', botActual, 'config.json')

  let nombreBot = global.namebot || 'PAIN BOT'

  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      if (config.name) nombreBot = config.name
    } catch (err) {}
  }

  const senderNumber = m.sender.replace(/[^0-9]/g, '')
  const botPath = path.join('./Serbot', senderNumber)

  if (!fs.existsSync(botPath)) {
    return conn.reply(m.chat, `¿Hola, cómo te va?\n\n* No encontré una sesión activa vinculada a tu número\n\n* Puede que aún no te hayas conectado\n\n* Si deseas iniciar una nueva, estaré aquí para ayudarte`, m, rcanal)
  }

  if (!text) return conn.reply(m.chat, `Necesito un nombre para continuar, cielo.
¿Podrías decírmelo con dulzura?\n\nEjemplo:\n\n* .setbotname BLACKPINK\n* .setbotname ${nombreBot}`, m, rcanal)

  const configPathUser = path.join(botPath, 'config.json')
  let config = {}

  if (fs.existsSync(configPathUser)) {
    try {
      config = JSON.parse(fs.readFileSync(configPathUser))
    } catch {}
  }

  config.name = text.trim()

  try {
    fs.writeFileSync(configPathUser, JSON.stringify(config, null, 2))
    return conn.reply(m.chat, `¡Nuevo nombre recibido con gracia!\n\n* Nombre (${text.trim()})\n\n* Si cambias de opinión, puedes volver a nombrarme cuando gustes`, m, rcanal)
  } catch {}
}

handler.help = ['setbotname']
handler.tags = ['serbot']
handler.command = ['setbotname']

export default handler
