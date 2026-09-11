import fs from 'fs'
import path from 'path'
import { join } from 'path'

const handler = async (m, { conn, usedPrefix, command }) => {
  const botActual = conn.user?.jid?.split('@')[0].replace(/\D/g, '')
  const rutaConfigGlobal = path.join('./Serbot', botActual, 'config.json')

  let nombreBot = global.namebot || 'PAIN BOT'
  if (fs.existsSync(rutaConfigGlobal)) {
    try {
      const configGlobal = JSON.parse(fs.readFileSync(rutaConfigGlobal))
      if (configGlobal.name) nombreBot = configGlobal.name
    } catch {}
  }

  const numeroRemitente = m.sender?.split('@')[0].replace(/\D/g, '')
  const rutaBot = path.join('./Serbot', numeroRemitente)
  const rutaConfig = path.join(rutaBot, 'config.json')

  if (!fs.existsSync(rutaBot) || !fs.existsSync(rutaConfig)) {
    return conn.reply(m.chat, `¿Hola, cómo te va?\n\n* No encontré una sesión activa vinculada a tu número\n\n* Puede que aún no te hayas conectado\n\n* Si deseas iniciar una nueva, estaré aquí para ayudarte`, m, rcanal)
  }

  const q = m.quoted || m
  const tipoMime = (q.msg || q).mimetype || ''

  if (!/image\/(jpe?g|png|webp)/.test(tipoMime)) {
    return conn.reply(m.chat, `Para continuar, necesito que respondas a una imagen.\n\n* ¿Podrías enviarme una y luego responderla con el comando?\n\n* Envía o reenvía una imagen respóndela con .setbotimg`, m, rcanal)
  }

  try {
    const bufferImg = await q.download?.()
    if (!bufferImg) return

    const nombreArchivo = `img_${Date.now()}.jpg`
    const rutaArchivo = path.join(rutaBot, nombreArchivo)
    fs.writeFileSync(rutaArchivo, bufferImg)

    const configuracion = fs.existsSync(rutaConfig)
      ? JSON.parse(fs.readFileSync(rutaConfig))
      : {}

    configuracion.img = rutaArchivo
    fs.writeFileSync(rutaConfig, JSON.stringify(configuracion, null, 2))

    return conn.reply(m.chat, `¡Imagen recibida con elegancia!\n\n* Tu imagen personalizada ha sido guardada correctamente\n\n* Puedes cambiarla nuevamente cuando lo desees`, m, rcanal)
  } catch (e) {
    return conn.reply(m.chat, `[❌]  Ocurrió un error al guardar tu imagen...\n\nInténtalo nuevamente o asegúrate de que sea una imagen válida.\n\n Asistente :: ${nombreBot}`, m, rcanal)
  }
}

handler.help = ['setbotimg']
handler.tags = ['serbot']
handler.command = ['setbotimg']

export default handler
