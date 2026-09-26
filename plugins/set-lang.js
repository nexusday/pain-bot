import { guardarIdioma, idiomaDe, normalizarIdioma, codigoVisible, nombreIdioma, tr } from '../lib/lang.js'

function ficha(conn, lineas) {
  return `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *${tr(conn, 'idioma', 'language', 'idioma')}*
╰─ ✧  ✩
${lineas}
╰─────────`.trim()
}

let handler = async (m, { conn, usedPrefix, args, isROwner }) => {
  const actual = idiomaDe(conn)

  if (!isROwner) {
    return conn.reply(m.chat, tr(
      conn,
      '[❗] Solo el owner de este bot puede cambiar el idioma.',
      '[❗] Only this bot\'s owner can change the language.',
      '[❗] Só o dono deste bot pode mudar o idioma.',
    ), m)
  }

  const pedido = args[0]
  if (!pedido) {
    return conn.reply(m.chat, ficha(conn, [
      `┊ ${tr(conn, 'este bot', 'this bot', 'este bot')}  ·  \`${codigoVisible(actual)}\``,
      `┊ ${nombreIdioma(actual)}`,
      `┊ \`${usedPrefix}setlen es\``,
      `┊ \`${usedPrefix}setlen in\``,
      `┊ \`${usedPrefix}setlen pt\``,
    ].join('\n')), m)
  }

  const lang = normalizarIdioma(pedido)
  if (!lang) {
    return conn.reply(m.chat, tr(
      conn,
      `[❗] Usa \`${usedPrefix}setlen es\`, \`${usedPrefix}setlen in\` o \`${usedPrefix}setlen pt\`.`,
      `[❗] Use \`${usedPrefix}setlen es\`, \`${usedPrefix}setlen in\` or \`${usedPrefix}setlen pt\`.`,
      `[❗] Usa \`${usedPrefix}setlen es\`, \`${usedPrefix}setlen in\` ou \`${usedPrefix}setlen pt\`.`,
    ), m)
  }

  guardarIdioma(conn, lang)
  const otros = ['es', 'in', 'pt'].filter((codigo) => codigo !== codigoVisible(lang)).join(' · ')
  return conn.reply(m.chat, ficha(conn, [
    `┊ ${tr(conn, 'este bot', 'this bot', 'este bot')}  ·  \`${codigoVisible(lang)}\``,
    `┊ ${nombreIdioma(lang)}`,
    `┊ ${tr(conn, 'los demás bots no cambian', 'other bots stay as they are', 'os outros bots não mudam')}`,
    `┊ ${tr(conn, 'también', 'also', 'também')}  ·  \`${otros}\``,
  ].join('\n')), m)
}

handler.help = ['setlen']
handler.tags = ['serbot']
handler.command = ['setlen', 'setlang', 'idioma']

export default handler
