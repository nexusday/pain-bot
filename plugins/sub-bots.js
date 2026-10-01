import ws from 'ws'
import path, { join } from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { isMainBotConn, cleanBotNum } from './modo-sub.js'
import { formatBotUptime } from '../lib/bot-uptime.js'
import { tr } from '../lib/lang.js'
import { sesionRequiereVincular } from '../lib/subbot-recovery.js'

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

    const conexionesActivas = global.conns.filter(connSub => {
      return Boolean(
        (connSub?.user?.jid || connSub?.user?.id) &&
        (connSub.ws?.isOpen === true || connSub.ws?.socket?.readyState === ws.OPEN)
      )
    })

    const usuariosUnicos = new Map()
    const idsGruposUnicos = new Set()
    const raizSubs = join(process.cwd(), global.bot || 'Serbot')
    const carpetasSesion = fs.existsSync(raizSubs)
      ? fs.readdirSync(raizSubs, { withFileTypes: true })
        .filter((entrada) => entrada.isDirectory() && fs.existsSync(join(raizSubs, entrada.name, 'creds.json')))
        .map((entrada) => entrada.name)
      : []
    const requierenVincular = carpetasSesion.filter((nombre) =>
      sesionRequiereVincular(join(raizSubs, nombre))
    ).length

    if (connBotPrincipal?.chats) {
      for (const jidUsuario of Object.keys(connBotPrincipal.chats)) {
        if (jidUsuario.endsWith('@g.us')) idsGruposUnicos.add(jidUsuario)
      }
    }

    for (const connSub of conexionesActivas) {
      const candidatos = [
        connSub?.phoneNumber,
        connSub?.botNumber,
        connSub?.pathAYBot ? path.basename(connSub.pathAYBot) : '',
        connSub?.user?.jid,
        connSub?.user?.id
      ]
      const numero = candidatos.map(cleanBotNum).find((valor) => valor.length >= 8)
      if (!numero) continue
      usuariosUnicos.set(numero, connSub)
      if (connSub.chats) {
        for (const jidUsuario of Object.keys(connSub.chats)) {
          if (jidUsuario.endsWith('@g.us')) idsGruposUnicos.add(jidUsuario)
        }
      }
    }

    const nombreBot = leerNombreConfig(rutaConfig, global.namebot || 'PAIN BOT')
    const totalSubBots = usuariosUnicos.size
    const totalBots = totalSubBots + 1
    const sinSocketActivo = Math.max(0, carpetasSesion.length - totalSubBots)
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
      for (const [numeroSubBot, connSub] of usuariosUnicos) {
        const rutaConfigSubBot = join(raizSubs, numeroSubBot, 'config.json')
        const nombreSubBot = leerNombreConfig(rutaConfigSubBot, `sub-bot ${i}`)
        const estadoSubBot = connSub.ws?.isOpen === true || connSub.ws?.socket?.readyState === ws.OPEN
          ? 'activo'
          : 'inactivo'
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
        `┊ \`${pref}code\`  ·  \`${pref}qr\``
    }

    const texto = `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *${nombreBot}*
╰─ ✧  ✩
┊ hosting  ·  https://nexcodea.com
┊ número  ·  \`+${botActual || '—'}\`
┊ tipo  ·  \`${tipoActual}\`
┊ memoria  ·  \`${memoriaMB} MB\`
┊ bots activos ·  \`${totalBots}\`
┊ sub-bots activos ·  \`${totalSubBots}\`
┊ sesiones guardadas ·  \`${carpetasSesion.length}\`
┊ sin socket activo ·  \`${sinSocketActivo}\`
┊ requieren vincular ·  \`${requierenVincular}\`
┊ grupos  ·  \`${totalGrupos}\`
┊ principal  ·  \`+${numPrincipal}\`
┊ estado  ·  \`${estadoBotPrincipal}\`
┊ uptime  ·  \`${uptimePrincipal}\`

${bloqueSubs}
╰─────────`.trim()

    const textoLocalizado = tr(
      conn,
      texto,
      texto
        .replace('sub-bots activos', 'active sub-bots')
        .replace('bots activos', 'active bots')
        .replace('sesiones guardadas', 'saved sessions')
        .replace('sin socket activo', 'without an active socket')
        .replace('requieren vincular', 'need relinking'),
      texto
        .replace('sub-bots ativos', 'sub-bots ativos')
        .replace('bots activos', 'bots ativos')
        .replace('sesiones guardadas', 'sessões guardadas')
        .replace('sin socket activo', 'sem socket ativo')
        .replace('requieren vincular', 'precisam de novo vínculo')
    )
    const imgBot = resolverImagenBot(rutaConfig)
    const optsEnvio = {
      contextInfo: {
        ...(global.rcanal?.contextInfo || {})
      }
    }

    try {
      await conn.sendFile(m.chat, imgBot, 'thumbnail.jpg', textoLocalizado, m, null, optsEnvio)
    } catch (err) {
      console.error('sub-bots sendFile falló, enviando texto:', err?.message || err)
      await conn.sendMessage(m.chat, { text: textoLocalizado, ...optsEnvio }, { quoted: m })
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
