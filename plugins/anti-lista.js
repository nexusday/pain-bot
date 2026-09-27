import { modoAnti } from '../lib/Antis/anti-modo.js'

function estadoBool(mapa, chatId) {
  return !!(mapa && mapa[chatId] === true)
}

function lineaModo(nombre, valor, legacy = 'del', extra = '') {
  const modo = modoAnti(valor, legacy)
  const activo = modo !== 'off'
  const marca = modo === 'all' ? '(ALL)' : modo === 'del' ? '(DEL)' : ''
  const resto = [marca, extra].filter(Boolean).join(' ')
  return linea(nombre, activo, resto)
}

function linea(nombre, activo, extra = '') {
  const icono = activo ? '🟢' : '🔴'
  const estado = activo ? 'ON' : 'OFF'
  return `${icono} *${nombre}:* ${estado}${extra ? ` ${extra}` : ''}`
}

let handler = async (m, { conn, usedPrefix }) => {
  if (!m.isGroup) {
    return conn.reply(m.chat, '[❗] Solo funciona en grupos.', m)
  }

  const chat = m.chat
  const db = global.db.data || {}

  const antiPalabra = db.antiPalabra?.[chat]
  const palabraOn = !!(antiPalabra && (antiPalabra.enabled === true || antiPalabra === true))
  const palabraExtra = palabraOn
    ? `(${Array.isArray(antiPalabra?.words) ? antiPalabra.words.length : 0} palabras)`
    : ''

  const antiCaracter = db.antiCaracter?.[chat]
  const caracterOn = !!(antiCaracter && antiCaracter.enabled === true)
  const caracterExtra = caracterOn ? `(límite ${antiCaracter.limit ?? '?'})` : ''

  const lineas = [
    lineaModo('antilink', db.antiLink?.[chat], 'all'),
    lineaModo('antiimg', db.antiImg?.[chat]),
    lineaModo('antiaudio', db.antiAudio?.[chat]),
    lineaModo('antivideo', db.antiVideo?.[chat]),
    lineaModo('antisticker', db.antiSticker?.[chat]),
    lineaModo('antispam', db.antiSpam?.[chat], 'all'),
    lineaModo('anticontact', db.antiContact?.[chat]),
    lineaModo('antimention', db.antiMention?.[chat]),
    lineaModo('antidocument', db.antiDocument?.[chat]),
    lineaModo('antipalabra', antiPalabra, 'del', palabraExtra),
    lineaModo('anticaracter', antiCaracter, 'all', caracterExtra),
    linea('antiprefijo', estadoBool(db.antiprefijo, chat)),
    lineaModo('antibot', db.antiBot?.[chat], 'all'),
    lineaModo('antiestados', db.antiEstados?.[chat]),
    linea('antidelete', estadoBool(db.antiDelete, chat)),
    linea('soloadmin', estadoBool(db.soloAdmin, chat))
  ]

  const activos = lineas.filter(l => l.includes('🟢')).length
  const total = lineas.length

  const texto =
    `*Antis del grupo*\n\n` +
    lineas.join('\n') +
    `\n\n› Activos: *${activos}/${total}*\n` +
    `> *del* / *on* solo borran el mensaje\n` +
    `> *all* borra el mensaje y expulsa\n` +
    `> Ej: ${usedPrefix}antilink del`

  return conn.sendMessage(
    m.chat,
    {
      text: texto,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) }
    },
    { quoted: m }
  )
}

handler.help = ['#antis → ver qué antis están ON/OFF']
handler.tags = ['grupo', 'admins']
handler.command = ['antis', 'antilista', 'listantis']
handler.group = true

export default handler
