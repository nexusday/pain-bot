import fs from 'fs'
import path from 'path'
import { join } from 'path'

const handler = async (m, { conn, usedPrefix, command }) => {
  const botActual = conn.user?.jid?.split('@')[0].replace(/\D/g, '')
  const configGlobalPath = path.join('./Serbot', botActual, 'config.json')

  let nombreBot = global.namebot || 'PAIN BOT'
  if (fs.existsSync(configGlobalPath)) {
    try {
      const globalConfig = JSON.parse(fs.readFileSync(configGlobalPath))
      if (globalConfig.name) nombreBot = globalConfig.name
    } catch {}
  }

  const senderNumber = m.sender?.split('@')[0].replace(/\D/g, '')
  const botPath = path.join('./Serbot', senderNumber)
  const configPath = path.join(botPath, 'config.json')

  if (!fs.existsSync(botPath) || !fs.existsSync(configPath)) {
    return conn.reply(m.chat, `¿Hola, cómo te va?\n\n* No encontré una sesión activa vinculada a tu número\n\n* Puede que aún no te hayas conectado\n\n* Si deseas iniciar una nueva, estaré aquí para ayudarte`, m, rcanal)
  }

  const q = m.quoted || m
  const mime = (q.msg || q).mimetype || ''

  if (!/image\/(jpe?g|png|webp)/.test(mime)) {
    return conn.reply(m.chat, `Para continuar, necesito que respondas a una imagen.\n\n* ¿Podrías enviarme una y luego responderla con el comando?\n\n* Envía o reenvía una imagen respóndela con .setbotimg`, m, rcanal)
  }

  try {
    const imgBuffer = await q.download?.()
    if (!imgBuffer) return

    const fileName = `img_${Date.now()}.jpg`
    const filePath = path.join(botPath, fileName)
    fs.writeFileSync(filePath, imgBuffer)

    const config = fs.existsSync(configPath)
      ? JSON.parse(fs.readFileSync(configPath))
      : {}

    config.img = filePath
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

    return conn.reply(m.chat, `¡Imagen recibida con elegancia!\n\n* Tu imagen personalizada ha sido guardada correctamente\n\n* Puedes cambiarla nuevamente cuando lo desees`, m, rcanal)
  } catch (e) {
    return conn.reply(m.chat, `[❌]  Ocurrió un error al guardar tu imagen...\n\nInténtalo nuevamente o asegúrate de que sea una imagen válida.\n\n Asistente :: ${nombreBot}`, m, rcanal)
  }
}

handler.help = ['setbotimg']
handler.tags = ['serbot']
handler.command = ['setbotimg']

export default handler
