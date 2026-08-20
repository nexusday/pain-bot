let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text || !text.trim()) {
    const user = global.db.data.users[m.sender] || {}
    const actual = (user.packname || user.author)
      ? `\n\nActual:\n> Pack: *${user.packname || '(defecto)'}*\n> Autor: *${user.author || '(defecto)'}*`
      : '\n\nAhora usas el pack/autor por defecto del bot.'

    return conn.reply(
      m.chat,
      `*[❗] Define el *pack* y/o el *autor* por defecto para tus stickers (.s, .st, .sw).*\n\n` +
        `Formato:\n> ${usedPrefix + command} pack | autor\n` +
        `Ejemplo:\n> ${usedPrefix + command} Pain Bot | Sunkovv\n` +
        `Solo pack:\n> ${usedPrefix + command} Mi Pack\n` +
        `Borrar: ${usedPrefix}delstickermeta` +
        actual,
      m,
      global.rcanal
    )
  }

  const parts = text.split('|')
  const packname = (parts[0] || '').trim()
  const author = parts.length > 1 ? parts.slice(1).join('|').trim() : ''

  if (!packname && !author) {
    return conn.reply(
      m.chat,
      `*[❗] No se detectó ningún dato válido.*\n> Usa: *pack* | autor\n> Ejemplo: *Forger* | Stickers`,
      m,
      global.rcanal
    )
  }

  const user = global.db.data.users[m.sender]
  if (!user) return

  if (packname) user.packname = packname
  if (parts.length > 1) user.author = author

  return conn.reply(
    m.chat,
    `✐ Metadata por defecto actualizada para tus stickers.` +
      `\n> Pack: *${user.packname || '(defecto del bot)'}*` +
      `\n> Autor: *${user.author || '(defecto del bot)'}*` +
      `\n\nPrueba con ${usedPrefix}s respondiendo a una imagen.`,
    m,
    global.rcanal
  )
}

handler.help = ['#setmeta • #setstickermeta + pack | autor\n→ Define pack y autor por defecto para /s']
handler.tags = ['stickers']
handler.command = ['setstickermeta', 'setmeta']

export default handler
