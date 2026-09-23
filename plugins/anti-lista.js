function estadoBool(mapa, chatId) {
  return !!(mapa && mapa[chatId] === true)
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
    ? `(${Array.isArray(antiPalabra?.words) ? antiPalabra.words.length : 0} palabras · ${antiPalabra?.action || 'delete'})`
    : ''

  const antiCaracter = db.antiCaracter?.[chat]
  const caracterOn = !!(antiCaracter && antiCaracter.enabled === true)
  const caracterExtra = caracterOn ? `(límite ${antiCaracter.limit ?? '?'})` : ''

  const lineas = [
    linea('antilink', estadoBool(db.antiLink, chat)),
    linea('antiimg', estadoBool(db.antiImg, chat)),
    linea('antiaudio', estadoBool(db.antiAudio, chat)),
    linea('antivideo', estadoBool(db.antiVideo, chat)),
    linea('antisticker', estadoBool(db.antiSticker, chat)),
    linea('antispam', estadoBool(db.antiSpam, chat)),
    linea('anticontact', estadoBool(db.antiContact, chat)),
    linea('antimention', estadoBool(db.antiMention, chat)),
    linea('antidocument', estadoBool(db.antiDocument, chat)),
    linea('antipalabra', palabraOn, palabraExtra),
    linea('anticaracter', caracterOn, caracterExtra),
    linea('antiprefijo', estadoBool(db.antiprefijo, chat)),
    linea('antibot', estadoBool(db.antiBot, chat)),
    linea('antiestados', estadoBool(db.antiEstados, chat)),
    linea('antidelete', estadoBool(db.antiDelete, chat)),
    linea('soloadmin', estadoBool(db.soloAdmin, chat))
  ]

  const activos = lineas.filter(l => l.includes('🟢')).length
  const total = lineas.length

  const texto =
    `*Antis del grupo*\n\n` +
    lineas.join('\n') +
    `\n\n› Activos: *${activos}/${total}*\n` +
    `> Ej: ${usedPrefix}antilink on`

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
