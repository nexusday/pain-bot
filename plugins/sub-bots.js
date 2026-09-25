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

function leerNombreConfig(ruta, fallback) {
  if (!fs.existsSync(ruta)) return fallback
  try {
    const configuracion = JSON.parse(fs.readFileSync(ruta, 'utf-8'))
    if (configuracion.name) return configuracion.name
  } catch {}
  return fallback
}

let handler = async (m, { conn, usedPrefix }) => {
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

    const nombreBot = leerNombreConfig(rutaConfig, global.namebot || 'PAIN BOT')
    const totalSubBots = usuariosUnicos.size
    const totalBots = totalSubBots + 1
    const totalGrupos = idsGruposUnicos.size
    const memoriaMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024)

    const numPrincipal = cleanBotNum(connBotPrincipal?.user?.jid || connBotPrincipal?.user?.id) || '—'
    const estadoBotPrincipal = connBotPrincipal?.user?.jid ? 'conectado' : 'desconectado'
    const uptimePrincipal = formatBotUptime(connBotPrincipal || numPrincipal)
    const tipoActual = isMainBotConn(conn) ? 'principal' : 'sub-bot'
    const pref = usedPrefix || '.'

    let bloqueSubs = ''
    if (totalSubBots > 0) {
      const lineas = []
      let i = 1
      for (const [jidUsuario, connSub] of usuariosUnicos) {
        const numeroSubBot = cleanBotNum(jidUsuario)
        const rutaConfigSubBot = join('./Serbot', numeroSubBot, 'config.json')
        const nombreSubBot = leerNombreConfig(rutaConfigSubBot, `sub-bot ${i}`)
        const estadoSubBot = connSub.ws?.socket?.readyState === ws.OPEN ? 'activo' : 'inactivo'
        const nombreUsuario = connSub.user?.name
          || connSub.authState?.creds?.me?.name
          || 'anónimo'
        const uptimeSub = formatBotUptime(connSub)

        lineas.push(
          `┊ *${i}.* ${nombreSubBot}\n` +
          `┊ \`+${numeroSubBot}\`  ·  \`${estadoSubBot}\`\n` +
          `┊ \`${nombreUsuario}\`  ·  \`${uptimeSub}\``
        )
        i++
      }
      bloqueSubs = lineas.join('\n\n')
    } else {
      bloqueSubs =
        `┊ \`sin sub-bots\`\n` +
        `┊ \`${pref}code\`  ·  \`${pref}qrr\``
    }

    const texto = `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *${nombreBot}*
╰─ ✧  ✩
┊ número  ·  \`+${botActual || '—'}\`
┊ tipo  ·  \`${tipoActual}\`
┊ memoria  ·  \`${memoriaMB} MB\`
┊ bots  ·  \`${totalBots}\`
┊ sub-bots  ·  \`${totalSubBots}\`
┊ grupos  ·  \`${totalGrupos}\`
┊ principal  ·  \`+${numPrincipal}\`
┊ estado  ·  \`${estadoBotPrincipal}\`
┊ uptime  ·  \`${uptimePrincipal}\`

${bloqueSubs}
┊ \`https://nexcodea.com\`
╰─────────`.trim()

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
