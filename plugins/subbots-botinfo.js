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

const SEP = '┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈'
const MARCA = '𓂃 ࣪ ִֶָ☾.'
const tip = (v) => `\`${String(v ?? '').replace(/`/g, "'")}\``

function resolverImagenBot(rutaConfig) {
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

  const candidatos = ['menu.jpg', 'menu2.jpg', 'menu3.jpg']
  const localPath = candidatos
    .map(nombre => join(DIR_IMG, nombre))
    .find(completo => {
      try { return fs.existsSync(completo) } catch { return false }
    })

  return localPath || IMG_POR_DEFECTO
}

function formatearPing(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

/** Tiempo real de ida y vuelta del bot hacia WhatsApp. */
async function medirPing(conn, chat) {
  if (!conn || typeof conn.sendPresenceUpdate !== 'function') return null
  const inicio = Date.now()
  try {
    await Promise.race([
      conn.sendPresenceUpdate('available', chat),
      new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('timeout')), 5000))
    ])
    return Math.max(0, Date.now() - inicio)
  } catch {
    return null
  }
}

function contarSubBots() {
  if (!Array.isArray(global.conns)) return 0
  const numPrincipal = cleanBotNum(global.conn?.user?.jid || global.conn?.user?.id)
  const vistos = new Set()
  for (const connSub of global.conns) {
    if (!connSub?.user?.jid) continue
    if (connSub.ws?.socket?.readyState !== ws.OPEN) continue
    const num = cleanBotNum(connSub.user.jid)
    if (!num || num === numPrincipal) continue
    if (isMainBotConn(connSub)) continue
    vistos.add(num)
  }
  return vistos.size
}

function lineasOwners() {
  if (!Array.isArray(global.owner) || !global.owner.length) return ''
  const lineas = []
  for (const entrada of global.owner) {
    const numero = Array.isArray(entrada) ? entrada[0] : entrada
    const nombre = Array.isArray(entrada) ? entrada[1] : 'owner'
    const digitos = String(numero || '').replace(/\D/g, '')
    if (!digitos || /^(0+|123|tunumero)$/i.test(digitos)) continue
    if (/tunumero|acael|xxx/i.test(String(numero))) continue
    lineas.push(`${tip(nombre || 'owner')}  ·  ${tip(`+${digitos}`)}`)
  }
  return lineas.join('\n')
}

let handler = async (m, { conn, usedPrefix }) => {
  try {
    const botActual = cleanBotNum(conn.user?.jid || conn.user?.id)
    const rutaConfig = join(DIR_RAIZ, 'Serbot', botActual, 'config.json')
    const esPrincipal = isMainBotConn(conn)

    let nombreBot = global.namebot || 'PAIN BOT'
    if (!esPrincipal && fs.existsSync(rutaConfig)) {
      try {
        const configuracion = JSON.parse(fs.readFileSync(rutaConfig, 'utf-8'))
        if (configuracion.name) nombreBot = configuracion.name
      } catch {}
    }

    const pingMs = await medirPing(conn, m.chat)
    const memoriaMB = Math.round(process.memoryUsage().rss / 1024 / 1024)
    const totalPlugins = Object.values(global.plugins || {}).filter(v => v?.help && v?.tags).length
    const subBotsActivos = contarSubBots()
    const owners = lineasOwners()
    const tipo = esPrincipal ? 'principal' : 'sub-bot'
    const pref = usedPrefix || '.'

    const texto = `
ㅤ
${MARCA}  *info*
_${nombreBot} · ${tipo}_

${SEP}
*estado*
ping  ·  ${tip(formatearPing(pingMs))}
uptime  ·  ${tip(formatBotUptime(conn))}
memoria  ·  ${tip(`${memoriaMB} MB`)}

${SEP}
*bot*
número  ·  ${tip(`+${botActual || '—'}`)}
prefijo  ·  ${tip(pref)}
librería  ·  ${tip('Baileys')}
plugins  ·  ${tip(totalPlugins)}
sub-bots  ·  ${tip(subBotsActivos)}
${owners ? `\n${SEP}\n*owners*\n${owners}\n` : ''}
${SEP}
*hosting*
> ${tip('https://nexcodea.com')}
ㅤ`.trim()

    const imgBot = resolverImagenBot(rutaConfig)
    const opts = {
      contextInfo: {
        ...(global.rcanal?.contextInfo || {})
      }
    }

    try {
      await conn.sendFile(m.chat, imgBot, 'thumbnail.jpg', texto, m, null, opts)
    } catch (err) {
      console.error('info sendFile falló, enviando texto:', err?.message || err)
      await conn.sendMessage(m.chat, { text: texto, ...opts }, { quoted: m })
    }
  } catch (e) {
    console.error('Error en /info:', e)
    await m.reply('[❌] Error al mostrar la info.\n> ' + (e?.message || e))
  }
}

handler.help = ['info', 'infobot']
handler.tags = ['subbots']
handler.command = ['info', 'infobot', 'botinfo']

export default handler
