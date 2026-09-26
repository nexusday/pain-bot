import { guardarModoMenu, modoMenuDe, normalizarModoMenu } from '../lib/menu-modo.js'
import { tr } from '../lib/lang.js'

function ficha(conn, lineas) {
  return `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *${tr(conn, 'menú', 'menu', 'menu')}*
╰─ ✧  ✩
${lineas}
╰─────────`.trim()
}

let handler = async (m, { conn, usedPrefix, args, isROwner, isAdmin }) => {
  const actual = modoMenuDe(conn)
  const puede = isROwner || isAdmin

  if (!puede) {
    return conn.reply(m.chat, tr(
      conn,
      '[❗] Solo el owner de este bot o un admin del grupo puede cambiar el menú.',
      '[❗] Only this bot\'s owner or a group admin can change the menu.',
      '[❗] Só o dono deste bot ou um admin do grupo pode mudar o menu.',
    ), m)
  }

  const pedido = args[0]
  if (!pedido) {
    return conn.reply(m.chat, ficha(conn, [
      `┊ ${tr(conn, 'este bot', 'this bot', 'este bot')}  ·  \`${actual}\``,
      `┊ \`${usedPrefix}setmenu ios\``,
      `┊ \`${usedPrefix}setmenu android\``,
      `┊ \`${usedPrefix}setmenu i\``,
      `┊ \`${usedPrefix}setmenu a\``,
    ].join('\n')), m)
  }

  const modo = normalizarModoMenu(pedido)
  if (!modo) {
    return conn.reply(m.chat, tr(
      conn,
      `[❗] Usa \`${usedPrefix}setmenu ios\` o \`${usedPrefix}setmenu android\`.`,
      `[❗] Use \`${usedPrefix}setmenu ios\` or \`${usedPrefix}setmenu android\`.`,
      `[❗] Usa \`${usedPrefix}setmenu ios\` ou \`${usedPrefix}setmenu android\`.`,
    ), m)
  }

  guardarModoMenu(conn, modo)
  const nota = modo === 'ios'
    ? tr(conn, 'texto y fotos, sin botones', 'text and photos, no buttons', 'texto e fotos, sem botões')
    : tr(conn, 'carrusel y botones', 'carousel and buttons', 'carrossel e botões')

  return conn.reply(m.chat, ficha(conn, [
    `┊ ${tr(conn, 'este bot', 'this bot', 'este bot')}  ·  \`${modo}\``,
    `┊ ${nota}`,
    `┊ ${tr(conn, 'los demás bots no cambian', 'other bots stay as they are', 'os outros bots não mudam')}`,
  ].join('\n')), m)
}

handler.help = ['setmenu ios/android']
handler.tags = ['serbot']
handler.command = ['setmenu', 'setmen']

export default handler
