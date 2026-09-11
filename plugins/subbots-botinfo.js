import fs from 'fs'
import path, { join } from 'path'
import { fileURLToPath } from 'url'
import ws from 'ws'
import { isMainBotConn, cleanBotNum } from './modo-sub.js'
import { formatBotUptime } from '../lib/bot-uptime.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DIR_RAIZ = join(__dirname, '..')
const DIR_IMG = join(DIR_RAIZ, 'storage', 'img')
const IMG_POR_DEFECTO = 'https://files.catbox.moe/iomah1.jpg'

function resolverImagenBot(rutaConfig) {
  const candidatos = ['menu2.jpg', 'menu.jpg', 'menu3.jpg']
  let imgBot = candidatos
    .map(nombre => join(DIR_IMG, nombre))
    .find(completo => {
      try { return fs.existsSync(completo) } catch { return false }
    }) || IMG_POR_DEFECTO

  if (!fs.existsSync(rutaConfig)) return imgBot

  try {
    const configuracion = JSON.parse(fs.readFileSync(rutaConfig, 'utf-8'))
    if (configuracion.img) {
      const personalizado = configuracion.img
      const personalizadoAbs = path.isAbsolute(personalizado) ? personalizado : join(DIR_RAIZ, personalizado)
      if (fs.existsSync(personalizadoAbs)) imgBot = personalizadoAbs
    }
  } catch {}

  return imgBot
}

let handler = async (m, { conn, usedPrefix }) => {
  const botActual = cleanBotNum(conn.user?.jid || conn.user?.id)
  const rutaConfig = join(DIR_RAIZ, 'Serbot', botActual, 'config.json')
  const esPrincipal = isMainBotConn(conn)

  let nombreBot = global.namebot || 'PAIN BOT'
  let imgBot = resolverImagenBot(rutaConfig)

  if (!esPrincipal && fs.existsSync(rutaConfig)) {
    try {
      const configuracion = JSON.parse(fs.readFileSync(rutaConfig, 'utf-8'))
      if (configuracion.name) nombreBot = configuracion.name
    } catch {}
  }

  const tipo = esPrincipal ? 'Principal' : 'Sub-Bot'
  const totalf = Object.values(global.plugins).filter(v => v.help && v.tags).length

  const formatearUptimeBot = formatBotUptime(conn)

  let subBotsActivos = 0
  if (global.conns && Array.isArray(global.conns)) {
    subBotsActivos = global.conns.filter(connSub =>
      connSub.user &&
      connSub.ws?.socket?.readyState !== ws.CLOSED
    ).length
  }

  let texto = `ɪɴғᴏ ᴅᴇʟ ʙᴏᴛ\n\n`
  texto += ` *Nombre:* ${nombreBot}\n`
  texto += ` *Número:* +${botActual || 'Desconocido'}\n`
  texto += ` *Tipo:* ${tipo}\n`
  texto += ` *Librería:* Baileys MD\n`
  texto += ` *Tiempo activo:* ${formatearUptimeBot}\n`
  texto += ` *Sub-bots activos:* ${subBotsActivos}\n`
  texto += ` *Plugins:* ${totalf}\n`
  texto += ` *Prefijo:* ${usedPrefix}\n\n`

  if (global.owner && Array.isArray(global.owner) && global.owner.length) {
    texto += `ᴘʀᴏᴘɪᴇᴛᴀʀɪᴏs\n\n`
    for (const [numero, nombre] of global.owner) {
      if (!numero || /tunumero|acael|xxx/i.test(String(numero))) continue
      texto += ` *${nombre || 'Owner'}:* +${String(numero).replace(/\D/g, '')}\n`
    }
    texto += `\n`
  }

  texto += `ʜᴏsᴛɪɴɢ ᴏғɪᴄɪᴀʟ\n\n`
  texto += ` *URL:* https://nexcodea.com`

  await conn.sendFile(m.chat, imgBot, 'thumbnail.jpg', texto.trim(), m, null, {
    contextInfo: {
      ...(global.rcanal?.contextInfo || {})
    }
  })
}

handler.help = ['info', 'infobot']
handler.tags = ['subbots']
handler.command = ['info', 'infobot', 'botinfo']

export default handler
