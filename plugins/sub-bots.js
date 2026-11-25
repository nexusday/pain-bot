import ws from 'ws'
import path, { join } from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { isMainBotConn, cleanBotNum } from './modo-sub.js'
import { formatBotUptime } from '../lib/bot-uptime.js'
import { tr } from '../lib/lang.js'
import { listarRequierenVincular, listarSesionesConCreds, sesionEnEmparejamiento } from '../lib/subbot-recovery.js'
import { snapshotSesiones } from '../lib/session-registry.js'

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

    // La lista debe representar sub-bots registrados, no solamente sockets
    // abiertos. Un socket puede estar caído y el sub-bot seguir vinculado.
    const usuariosUnicos = new Map()
    const idsGruposUnicos = new Set()
    const estadosWorkers = [{ workerId: 'primary', sessions: snapshotSesiones() }]
    const raizSubs = join(process.cwd(), global.bot || 'Serbot')
    const carpetasSesion = listarSesionesConCreds(raizSubs)
    // Incluye marcas sin creds (carpeta limpiada): si no, son invisibles.
    const carpetasRevincular = listarRequierenVincular(raizSubs)
    const requierenVincular = carpetasRevincular.length

    if (connBotPrincipal?.chats) {
      for (const jidUsuario of Object.keys(connBotPrincipal.chats)) {
        if (jidUsuario.endsWith('@g.us')) idsGruposUnicos.add(jidUsuario)
      }
    }

    const agregarSesion = (numero, info = {}) => {
      if (!numero || numero.length < 8) return
      const anterior = usuariosUnicos.get(numero)
      const estadoEspecial = ['relink', 'pairing'].includes(info.status)
        ? info.status
        : ['relink', 'pairing'].includes(anterior?.status)
          ? anterior.status
          : null
      usuariosUnicos.set(numero, {
        conn: info.conn || anterior?.conn || null,
        folder: info.folder || anterior?.folder || numero,
        name: info.name || anterior?.name || '',
        connected: Boolean(info.connected || anterior?.connected),
        status: info.connected || anterior?.connected
          ? 'connected'
          : estadoEspecial || info.status || anterior?.status || 'saved',
      })
    }

    // Primero se cargan todas las sesiones persistidas, incluso las que no
    // tienen socket activo. Las carpetas archivadas aparecen como relink.
    for (const folder of carpetasSesion) {
      agregarSesion(cleanBotNum(folder), {
        folder,
        status: sesionEnEmparejamiento(join(raizSubs, folder)) ? 'pairing' : 'saved',
      })
    }
    for (const folder of carpetasRevincular) {
      agregarSesion(cleanBotNum(folder), { folder, status: 'relink' })
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
      agregarSesion(numero, {
        conn: connSub,
        folder: connSub?.pathAYBot ? path.basename(connSub.pathAYBot) : numero,
        name: connSub.user?.name || connSub.authState?.creds?.me?.name || '',
        connected: true,
        status: 'connected',
      })
      if (connSub.chats) {
        for (const jidUsuario of Object.keys(connSub.chats)) {
          if (jidUsuario.endsWith('@g.us')) idsGruposUnicos.add(jidUsuario)
        }
      }
    }

    for (const worker of estadosWorkers) {
      for (const session of worker.sessions) {
        const numero = cleanBotNum(session.number || session.folder)
        agregarSesion(numero, {
          conn: null,
          folder: session.folder,
          name: session.name || '',
          connected: session.connected,
          status: session.connected ? 'connected' : 'saved',
        })
      }
    }

    const nombreBot = leerNombreConfig(rutaConfig, global.namebot || 'PAIN BOT')
    const totalSubBots = usuariosUnicos.size
    const conectadosAhora = [...usuariosUnicos.values()].filter((info) => info.connected).length
    const guardadasDesconectadas = [...usuariosUnicos.values()].filter((info) => info.status === 'saved').length
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
      for (const [numeroSubBot, info] of usuariosUnicos) {
        const connSub = info.conn
        const rutaConfigSubBot = join(raizSubs, info.folder, 'config.json')
        const nombreSubBot = leerNombreConfig(rutaConfigSubBot, `sub-bot ${i}`)
        const estadoSubBot = info.status === 'connected'
          ? 'conectado'
          : info.status === 'relink'
            ? 'requiere vincular'
            : info.status === 'pairing'
              ? 'vinculando'
              : 'guardado'
        const nombreUsuario = info.name || 'anónimo'
        const uptimeSub = connSub
          ? formatBotUptime(connSub)
          : info.connected
            ? 'conectado en worker'
            : 'sin conexión activa'

        lineas.push(
          `┊ *${i}.* ${nombreSubBot}\n` +
          `┊ \`+${numeroSubBot}\`  ·  \`${estadoSubBot}\`\n` +
          `┊ \`${nombreUsuario}\`  ·  \`${uptimeSub}\``
        )
        i++
      }
      bloqueSubs = lineas.join('\n\n')
    } else {
      const { panelWebActivo, urlPublicaPanel } = await import('../lib/webpanel-url.js')
      const urlPanel = panelWebActivo() ? urlPublicaPanel() : ''
      bloqueSubs = urlPanel
        ? `┊ \`sin sub-bots\`\n┊ crea el tuyo desde el panel\n┊ ${urlPanel}`
        : `┊ \`sin sub-bots\`\n┊ \`${pref}code\`  ·  \`${pref}qr\``
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
 ┊ bots totales ·  \`${totalBots}\`
 ┊ sub-bots vinculados ·  \`${totalSubBots}\`
 ┊ conectados ahora ·  \`${conectadosAhora}\`
 ┊ sesiones guardadas ·  \`${guardadasDesconectadas}\`
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
         .replace('sub-bots vinculados', 'linked sub-bots')
         .replace('bots totales', 'total bots')
         .replace('conectados ahora', 'connected now')
         .replace('sesiones guardadas', 'saved sessions')
         .replace('requieren vincular', 'need relinking'),
      texto
        .replace('sub-bots vinculados', 'sub-bots vinculados')
        .replace('bots totales', 'bots totais')
        .replace('conectados ahora', 'conectados agora')
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
