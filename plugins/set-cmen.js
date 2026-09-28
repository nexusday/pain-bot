import { estiloCategoriaDe, guardarEstiloCategoria, normalizarEstiloCategoria } from '../lib/menu-modo.js'
import { puedeUsarMod } from '../lib/staff.js'
import { tr } from '../lib/lang.js'

const NOMBRES = {
  1: ['actual', 'current', 'atual'],
  2: ['grupos', 'groups', 'grupos'],
  3: ['lista', 'list', 'lista'],
  4: ['uso', 'usage', 'uso'],
  5: ['plano', 'plain', 'simples'],
}

function nombre(conn, estilo) {
  return tr(conn, ...NOMBRES[estilo])
}

function ficha(conn, lineas) {
  return `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *${tr(conn, 'categorías', 'categories', 'categorias')}*
╰─ ✧  ✩
${lineas}
╰─────────`.trim()
}

let handler = async (m, { conn, usedPrefix, args }) => {
  if (!puedeUsarMod(m, conn)) {
    return conn.reply(m.chat, tr(
      conn,
      '[❗] Solo el *owner principal* o el dueño de este bot puede cambiar esto.',
      '[❗] Only the *main owner* or this bot\'s owner can change this.',
      '[❗] Só o *owner principal* ou o dono deste bot pode mudar isto.',
    ), m)
  }

  const actual = estiloCategoriaDe(conn)
  const pedido = args[0]
  if (!pedido) {
    const lista = [1, 2, 3, 4, 5]
      .map(n => `┊ \`${n}\`  ${nombre(conn, String(n))}${String(n) === actual ? '  ·  ' + tr(conn, 'ahora', 'now', 'agora') : ''}`)
      .join('\n')
    return conn.reply(m.chat, ficha(conn, [
      `┊ ${tr(conn, 'este bot', 'this bot', 'este bot')}  ·  \`${actual}\``,
      lista,
      `┊ \`${usedPrefix}setcmen 2\``,
    ].join('\n')), m)
  }

  const estilo = normalizarEstiloCategoria(pedido)
  if (!estilo) {
    return conn.reply(m.chat, tr(
      conn,
      `[❗] Usa \`${usedPrefix}setcmen 1\` hasta \`${usedPrefix}setcmen 5\`.`,
      `[❗] Use \`${usedPrefix}setcmen 1\` through \`${usedPrefix}setcmen 5\`.`,
      `[❗] Usa \`${usedPrefix}setcmen 1\` até \`${usedPrefix}setcmen 5\`.`,
    ), m)
  }

  guardarEstiloCategoria(conn, estilo)
  return conn.reply(m.chat, ficha(conn, [
    `┊ ${tr(conn, 'este bot', 'this bot', 'este bot')}  ·  \`${estilo}\`  ${nombre(conn, estilo)}`,
    `┊ ${tr(conn, 'los demás bots no cambian', 'other bots stay as they are', 'os outros bots não mudam')}`,
    `┊ ${tr(conn, 'abre una categoría para verlo', 'open a category to see it', 'abre uma categoria para ver')}`,
  ].join('\n')), m)
}

handler.help = ['setcmen 1-5']
handler.tags = ['serbot']
handler.command = ['setcmen', 'setcmenu', 'setcatmenu']

export default handler
