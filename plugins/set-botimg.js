import fs from 'fs'
import path from 'path'
import { tr } from '../lib/lang.js'

const handler = async (m, { conn, usedPrefix, command }) => {
  const numeroRemitente = m.sender?.split('@')[0].replace(/\D/g, '')
  const rutaBot = path.join('./Serbot', numeroRemitente)
  const rutaConfig = path.join(rutaBot, 'config.json')

  if (!fs.existsSync(rutaBot) || !fs.existsSync(rutaConfig)) {
    return conn.reply(m.chat, tr(conn,
      '[❗] No encontré una sesión vinculada a tu número.',
      '[❗] I could not find a session linked to your number.',
      '[❗] Não encontrei uma sessão ligada ao seu número.'
    ), m, rcanal)
  }

  const q = m.quoted || m
  const tipoMime = (q.msg || q).mimetype || ''

  if (!/image\/(jpe?g|png|webp)/.test(tipoMime)) {
    return conn.reply(m.chat, tr(conn,
      `*[❗] Responde a una imagen.*\n> ${usedPrefix}setbotimg`,
      `*[❗] Reply to an image.*\n> ${usedPrefix}setbotimg`,
      `*[❗] Responda a uma imagem.*\n> ${usedPrefix}setbotimg`
    ), m, rcanal)
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

    return conn.reply(m.chat, tr(conn,
      'ִֶָ☾. *Imagen actualizada*',
      'ִֶָ☾. *Image updated*',
      'ִֶָ☾. *Imagem atualizada*'
    ), m, rcanal)
  } catch (e) {
    return conn.reply(m.chat, tr(conn,
      '[❌] No se pudo guardar la imagen.',
      '[❌] Could not save the image.',
      '[❌] Não foi possível guardar a imagem.'
    ), m, rcanal)
  }
}

handler.help = ['setbotimg']
handler.tags = ['serbot']
handler.command = ['setbotimg']

export default handler
