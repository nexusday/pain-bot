import ws from 'ws'
import path, { join } from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { isMainBotConn, cleanBotNum } from './modo-sub.js'
import { formatBotUptime } from '../lib/bot-uptime.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DIR_RAIZ = path.join(__dirname, '..')
const DIR_IMG = join(DIR_RAIZ, 'storage', 'img')
const IMG_POR_DEFECTO = 'https://files.catbox.moe/iomah1.jpg'

function resolverImagenBot(rutaConfig) {
  const candidatos = ['menu.jpg', 'menu2.jpg', 'menu3.jpg']
  const localPath = candidatos
    .map(nombre => join(DIR_IMG, nombre))
    .find(completo => {
      try { return fs.existsSync(completo) } catch { return false }
    })

  if (localPath) return localPath

  if (rutaConfig && fs.existsSync(rutaConfig)) {
    try {
      const configuracion = JSON.parse(fs.readFileSync(rutaConfig, 'utf-8'))
      if (configuracion.img) {
        const personalizado = configuracion.img
        if (/^https?:\/\//i.test(personalizado)) return personalizado
        const personalizadoAbs = path.isAbsolute(personalizado) ? personalizado : join(DIR_RAIZ, personalizado)
        if (fs.existsSync(personalizadoAbs)) return personalizadoAbs
      }
    } catch {}
  }

  return IMG_POR_DEFECTO
}

let handler = async (m, { conn }) => {
  try {
    if (!global.conns || !Array.isArray(global.conns)) {
      global.conns = []
    }

    const connBotPrincipal = global.conn
    const botActual = cleanBotNum(conn.user?.jid || conn.user?.id)
    const rutaConfig = join('./Serbot', botActual, 'config.json')

    global.conns = global.conns.filter(connSub => {
      return Boolean(
        connSub?.user?.jid &&
        connSub.ws?.socket?.readyState === ws.OPEN
      )
    })

    const usuariosUnicos = new Map()
    const idsGruposUnicos = new Set()

    if (connBotPrincipal?.chats) {
      for (const jidUsuario of Object.keys(connBotPrincipal.chats)) {
        if (jidUsuario.endsWith('@g.us')) idsGruposUnicos.add(jidUsuario)
      }
    }

    for (const connSub of global.conns) {
      if (!connSub?.user?.jid) continue
      usuariosUnicos.set(connSub.user.jid, connSub)
      if (connSub.chats) {
        for (const jidUsuario of Object.keys(connSub.chats)) {
          if (jidUsuario.endsWith('@g.us')) idsGruposUnicos.add(jidUsuario)
        }
      }
    }

    let nombreBot = global.namebot || 'PAIN BOT'
    if (fs.existsSync(rutaConfig)) {
      try {
        const configuracion = JSON.parse(fs.readFileSync(rutaConfig, 'utf-8'))
        if (configuracion.name) nombreBot = configuracion.name
      } catch {}
    }

    const totalSubBots = usuariosUnicos.size
    const totalBots = totalSubBots + 1
    const totalGrupos = idsGruposUnicos.size
    const memoriaMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024)

    const numPrincipal = cleanBotNum(connBotPrincipal?.user?.jid || connBotPrincipal?.user?.id) || 'Desconocido'
    const estadoBotPrincipal = connBotPrincipal?.user?.jid ? 'Conectado' : 'Desconectado'
    const formatearUptimeBotPrincipal = formatBotUptime(connBotPrincipal || numPrincipal)

    let texto = `ɪɴғᴏ ᴅᴇ ʙᴏᴛs\n\n`
    texto += ` *Bot actual:* ${nombreBot}\n`
    texto += ` *Número:* +${botActual || 'Desconocido'}\n`
    texto += ` *Tipo:* ${isMainBotConn(conn) ? 'Principal' : 'Sub-Bot'}\n`
    texto += ` *Memoria:* ${memoriaMB} MB\n\n`

    texto += `ᴇsᴛᴀᴅɪsᴛɪᴄᴀs\n\n`
    texto += ` *Total de bots:* ${totalBots}\n`
    texto += ` *Bot principal:* 1\n`
    texto += ` *Sub-bots activos:* ${totalSubBots}\n`
    texto += ` *Grupos (únicos):* ${totalGrupos}\n\n`

    texto += `ʙᴏᴛ ᴘʀɪɴᴄɪᴘᴀʟ\n\n`
    texto += ` *Número:* +${numPrincipal}\n`
    texto += ` *Estado:* ${estadoBotPrincipal}\n`
    texto += ` *Tiempo activo:* ${formatearUptimeBotPrincipal}\n\n`

    if (totalSubBots > 0) {
      texto += `sᴜʙ-ʙᴏᴛs ᴀᴄᴛɪᴠᴏs\n\n`
      let i = 1
      for (const [jidUsuario, connSub] of usuariosUnicos) {
        const numeroSubBot = cleanBotNum(jidUsuario)
        const rutaConfigSubBot = join('./Serbot', numeroSubBot, 'config.json')
        let nombreSubBot = `Sub-Bot ${i}`

        if (fs.existsSync(rutaConfigSubBot)) {
          try {
            const configSubBot = JSON.parse(fs.readFileSync(rutaConfigSubBot, 'utf-8'))
            if (configSubBot.name) nombreSubBot = configSubBot.name
          } catch {}
        }

        const estadoSubBot = connSub.ws?.socket?.readyState === ws.OPEN ? 'Activo' : 'Inactivo'
        let nombreUsuario = connSub.user?.name
          || connSub.authState?.creds?.me?.name
          || 'Anónimo'
        const uptimeSub = formatBotUptime(connSub)

        texto += `*${i}.* ${nombreSubBot}\n`
        texto += ` *Número:* +${numeroSubBot}\n`
        texto += ` *Usuario:* ${nombreUsuario}\n`
        texto += ` *Estado:* ${estadoSubBot}\n`
        texto += ` *Tiempo activo:* ${uptimeSub}\n`
        if (i < totalSubBots) texto += `\n`
        i++
      }
      texto += `\n`
    } else {
      texto += `sᴜʙ-ʙᴏᴛs\n\n`
      texto += ` *Sin sub-bots activos*\n`
      texto += ` *Usa .code o .qrr para crear uno*\n\n`
    }

    texto += `ʀᴇsᴜᴍᴇɴ\n\n`
    texto += ` *Bots totales:* ${totalBots}\n\n`

    texto += `ʜᴏsᴛɪɴɢ ᴏғɪᴄɪᴀʟ\n\n`
    texto += ` *URL:* https://nexcodea.com`

    const imgBot = resolverImagenBot(rutaConfig)
    const optsEnvio = {
      contextInfo: {
        ...(global.rcanal?.contextInfo || {})
      }
    }

    try {
      await conn.sendFile(m.chat, imgBot, 'thumbnail.jpg', texto, m, null, optsEnvio)
    } catch (err) {
      console.error('sub-bots sendFile falló, enviando texto:', err?.message || err)
      await conn.sendMessage(m.chat, { text: texto, ...optsEnvio }, { quoted: m })
    }
  } catch (e) {
    console.error('Error en /bots:', e)
    await m.reply('[❌] Error al listar los bots.\n> ' + (e?.message || e))
  }
}

handler.command = ['listjadibot', 'bots', 'subbots', 'listbots']
handler.help = ['bots', 'subbots', 'listbots']
handler.tags = ['subbots']
export default handler
