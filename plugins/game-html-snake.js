import { sendHtmlWhatsApp } from '../lib/wa-html.js'
import { htmlSnake } from '../lib/html-games/snake.js'
import {
  statsSnakeDe,
  topSnakeBest,
  topSnakeTotal,
  construirTextoTopSnake
} from '../lib/snake-scores.js'
import {
  crearSesionSnake,
  dominiosTrustedSnake,
  obtenerSnakePublicUrl
} from '../lib/snake-api.js'

function prefijoDe(usedPrefix) {
  const p = String(usedPrefix || '.').trim()
  return p.slice(0, 3) || '.'
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  const cmd = String(command || '').toLowerCase()
  const sub = String(args[0] || '').toLowerCase()

  // /topsnake | /snake top | /snake tops
  if (
    ['topsnake', 'snaketop', 'topserpiente'].includes(cmd) ||
    (['snake', 'serpiente', 'htmlsnake'].includes(cmd) && ['top', 'tops', 'ranking', 'global', 'total', 'acumulado'].includes(sub))
  ) {
    const modoFinal =
      ['total', 'acumulado', 'suma'].includes(sub) ||
      ['total', 'acumulado', 'suma'].includes(String(args[1] || '').toLowerCase())
        ? 'total'
        : 'best'

    const lista = modoFinal === 'total' ? topSnakeTotal(10) : topSnakeBest(10)
    const texto = construirTextoTopSnake(lista, { modo: modoFinal })
    const mio = statsSnakeDe(m.sender)
    const extra =
      mio.best || mio.total
        ? `\n\n› Tú: récord *${mio.best}* · total *${mio.total}* · partidas *${mio.games}*`
        : ''

    return conn.sendMessage(
      m.chat,
      {
        text: texto + extra + `\n\n> Jugar: ${usedPrefix}snake\n> Los puntos se guardan solos al terminar.`,
        contextInfo: { ...rcanal.contextInfo }
      },
      { quoted: m }
    )
  }

  // /snakeok — desactivado (anti-trampa)
  if (['snakeok', 'snakesave', 'snakeclaim', 'guardarsnake'].includes(cmd)) {
    return conn.reply(
      m.chat,
      `*[❗] Ya no se usan puntos manuales.*\n\n` +
        `Juega con *${usedPrefix}snake* y al terminar la partida se guarda sola en el top.\n` +
        `> Ver ranking: ${usedPrefix}topsnake`,
      m
    )
  }

  // /snake → juego personal + sesión firmada
  try {
    const nombre =
      m.pushName ||
      m.name ||
      global.db?.data?.users?.[m.sender]?.name ||
      m.sender?.split('@')[0] ||
      'Jugador'
    const stats = statsSnakeDe(m.sender)
    const top = topSnakeBest(5)
    const publicUrl = obtenerSnakePublicUrl()

    if (!publicUrl) {
      return conn.reply(
        m.chat,
        `*[❗] No se detectó IP de red para Snake.*\n\n` +
          `El juego corre en el celular y debe hablar con el bot por HTTP.\n` +
          `> Misma WiFi: debería auto-detectar la IP LAN\n` +
          `> O en config.js: global.snakePublicUrl = 'http://TU-IP:3000'`,
        m
      )
    }

    const sesion = crearSesionSnake({ jid: m.sender, name: nombre })
    const trusted = dominiosTrustedSnake()
    const isHttp = /^http:\/\//i.test(publicUrl)

    if (isHttp) {
      console.warn(
        `[snake] URL en HTTP (${publicUrl}). WhatsApp suele bloquear fetch cleartext; ` +
          `si falla el guardado, pon HTTPS (Cloudflare Tunnel) en snakePublicUrl.`
      )
    }
    console.log(`[snake] trusted_sources: ${trusted.join(' | ')}`)

    await sendHtmlWhatsApp(conn, m.chat, {
      html: htmlSnake({
        playerName: nombre,
        best: stats.best,
        prefix: prefijoDe(usedPrefix),
        top,
        api: {
          base: sesion.apiBase,
          sessionId: sesion.sessionId,
          token: sesion.token
        }
      }),
      trustedSources: trusted
    })
  } catch (e) {
    console.error('[snake html]', e?.message || e)
    return conn.reply(m.chat, `[❌] No se pudo enviar Snake.\n> ${usedPrefix}snake`, m)
  }
}

handler.help = [
  'snake - Juego personal (auto-guarda al top)',
  'topsnake - Top 10 récords',
  'topsnake total - Top 10 acumulado'
]
handler.tags = ['game', 'fun']
handler.command = [
  'snake',
  'serpiente',
  'htmlsnake',
  'snakeok',
  'snakesave',
  'snakeclaim',
  'guardarsnake',
  'topsnake',
  'snaketop',
  'topserpiente'
]

export default handler
