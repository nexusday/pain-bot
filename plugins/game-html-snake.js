import { sendHtmlWhatsApp } from '../lib/wa-html.js'
import { htmlSnake } from '../lib/html-games/snake.js'
import {
  statsSnakeDe,
  registrarScoreSnake,
  topSnakeBest,
  topSnakeTotal,
  construirTextoTopSnake
} from '../lib/snake-scores.js'

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
        text: texto + extra + `\n\n> Jugar: ${usedPrefix}snake\n> Guardar puntos: ${usedPrefix}snakeok <puntos>`,
        contextInfo: { ...rcanal.contextInfo }
      },
      { quoted: m }
    )
  }

  // /snakeok 120
  if (['snakeok', 'snakesave', 'snakeclaim', 'guardarsnake'].includes(cmd)) {
    const puntos = args[0]
    if (puntos === undefined || puntos === '') {
      return conn.reply(
        m.chat,
        `*[❗] Uso:*\n> ${usedPrefix}snakeok <puntos>\n\nEjemplo:\n> ${usedPrefix}snakeok 120\n\n_(Al terminar la partida te aparece el comando exacto.)_`,
        m
      )
    }

    const nombre = m.pushName || m.name || global.db?.data?.users?.[m.sender]?.name || 'Jugador'
    const r = await registrarScoreSnake(m.sender, puntos, nombre)

    if (!r.ok) {
      if (r.error === 'cooldown') {
        return conn.reply(m.chat, `[⏳] Espera *${r.wait}s* para guardar otra partida.`, m)
      }
      if (r.error === 'alto') {
        return conn.reply(m.chat, `[❗] Máximo *${r.max}* puntos por partida.`, m)
      }
      if (r.error === 'paso') {
        return conn.reply(m.chat, `[❗] Los puntos van de *${r.step}* en *${r.step}* (10, 20, 30...).`, m)
      }
      return conn.reply(m.chat, '[❗] Puntuación inválida.', m)
    }

    const top = topSnakeBest(10)
    const puesto = top.findIndex(x => x.jid === m.sender) + 1

    return conn.sendMessage(
      m.chat,
      {
        text:
          `${r.newRecord ? '🏆 *Nuevo récord*' : '✅ *Partida guardada*'}\n\n` +
          `› Puntos: *${r.score}*\n` +
          `› Récord: *${r.best}*\n` +
          `› Total acumulado: *${r.total}*\n` +
          `› Partidas: *${r.games}*\n` +
          (puesto ? `› Puesto global: *#${puesto}*\n` : '') +
          `\n> Ver top: ${usedPrefix}topsnake`,
        contextInfo: { ...rcanal.contextInfo }
      },
      { quoted: m }
    )
  }

  // /snake → juego personal
  try {
    const nombre = m.pushName || m.name || global.db?.data?.users?.[m.sender]?.name || m.sender?.split('@')[0] || 'Jugador'
    const stats = statsSnakeDe(m.sender)
    const top = topSnakeBest(5)

    await sendHtmlWhatsApp(conn, m.chat, {
      html: htmlSnake({
        playerName: nombre,
        best: stats.best,
        prefix: prefijoDe(usedPrefix),
        top
      })
    })
  } catch (e) {
    console.error('[snake html]', e?.message || e)
    return conn.reply(m.chat, `[❌] No se pudo enviar Snake.\n> ${usedPrefix}snake`, m)
  }
}

handler.help = [
  'snake - Juego personal en el chat',
  'snakeok <puntos> - Guardar puntos al top global',
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
