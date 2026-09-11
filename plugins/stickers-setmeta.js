let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text || !text.trim()) {
    const usuario = global.db.data.users[m.sender] || {}
    const actual = (usuario.packname || usuario.author)
      ? `\n\nActual:\n> Pack: *${usuario.packname || '(defecto)'}*\n> Autor: *${usuario.author || '(defecto)'}*`
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

  const partes = text.split('|')
  const nombrePack = (partes[0] || '').trim()
  const autor = partes.length > 1 ? partes.slice(1).join('|').trim() : ''

  if (!nombrePack && !autor) {
    return conn.reply(
      m.chat,
      `*[❗] No se detectó ningún dato válido.*\n> Usa: *pack* | autor\n> Ejemplo: *Forger* | Stickers`,
      m,
      global.rcanal
    )
  }

  const usuario = global.db.data.users[m.sender]
  if (!usuario) return

  if (nombrePack) usuario.packname = nombrePack
  if (partes.length > 1) usuario.author = autor

  return conn.reply(
    m.chat,
    `✐ Metadata por defecto actualizada para tus stickers.` +
      `\n> Pack: *${usuario.packname || '(defecto del bot)'}*` +
      `\n> Autor: *${usuario.author || '(defecto del bot)'}*` +
      `\n\nPrueba con ${usedPrefix}s respondiendo a una imagen.`,
    m,
    global.rcanal
  )
}

handler.help = ['#setmeta • #setstickermeta + pack | autor\n→ Define pack y autor por defecto para /s']
handler.tags = ['stickers']
handler.command = ['setstickermeta', 'setmeta']

export default handler
