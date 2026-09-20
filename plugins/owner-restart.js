import chalk from 'chalk'
import path from 'path'
import { esBotPrincipal, numeroBotDe } from '../lib/staff.js'

async function reiniciarSoloEsteSubBot(conn) {
  const num = numeroBotDe(conn)
  if (!num) throw new Error('No se pudo identificar el número del subbot')

  const pathAYBot = path.join(`./${global.bot || 'Serbot'}`, num)

  try { conn.ev?.removeAllListeners?.() } catch {}

  if (Array.isArray(global.conns)) {
    global.conns = global.conns.filter(c => c !== conn)
  }

  try { conn.ws?.close?.() } catch {}
  try { conn.end?.() } catch {}

  const { AYBot } = await import('./serbot-serbot.js')
  await AYBot({
    pathAYBot,
    m: null,
    conn: global.conn,
    args: [],
    usedPrefix: '.',
    command: 'qr',
    fromCommand: false,
    phoneNumber: num
  })
}

let handler = async (m, { conn, isOwner }) => {
  if (!isOwner) {
    return m.reply('*[❗] Solo los dueños pueden usar este comando.*')
  }

  const esSub = !esBotPrincipal(conn)
  const numSub = esSub ? numeroBotDe(conn) : null

  try {
    const mensajeReinicio = esSub
      ? `🌴 *Sub-Bot reiniciado*\n> *Bot:* +${numSub}\n> *Iniciado por:* @${m.sender.split('@')[0]}\n> _Solo este subbot (el principal sigue activo)._`
      : `🌴 *Bot reiniciado*\n> *Iniciado por:* @${m.sender.split('@')[0]}\n> _Reinicio del bot principal._`

    await conn.sendMessage(m.chat, {
      text: mensajeReinicio,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender]
      }
    }, { quoted: m })

    if (esSub) {
      setTimeout(async () => {
        try {
          console.log(chalk.yellow(`Reinicio SOLO subbot +${numSub} por:`, m.sender))
          await reiniciarSoloEsteSubBot(conn)
          console.log(chalk.green(`Subbot +${numSub} reiniciado correctamente`))
        } catch (e) {
          console.error(`Error reiniciando subbot +${numSub}:`, e?.message || e)
        }
      }, 1500)
      return
    }

    // Solo el principal mata el proceso
    setTimeout(() => {
      console.log(chalk.yellow('Reinicio del PRINCIPAL iniciado por owner:', m.sender))
      process.exit(0)
    }, 3000)
  } catch (e) {
    console.error('Error en comando restart:', e)
    conn.reply(m.chat, '[❌] Hubo un error al reiniciar el bot.', m, rcanal)
  }
}

handler.command = ['restart', 'reiniciar', 'reboot']
handler.tags = ['owner']
handler.help = [
  'restart - Reiniciar este bot (en subbot solo reinicia ese subbot)',
]
handler.rowner = true

export default handler
