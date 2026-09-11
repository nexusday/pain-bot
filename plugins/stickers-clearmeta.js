/**
 * Restablece pack/autor por defecto del usuario (usado por .s / setmeta).
 * Alias: delstickermeta (delmeta ahora cambia metadata de un sticker).
 */
let handler = async (m, { conn }) => {
  const usuario = global.db.data.users[m.sender]
  if (!usuario) return

  usuario.packname = ''
  usuario.author = ''

  return conn.reply(
    m.chat,
    `✐ Se restablecieron el *pack* y *autor* por defecto para tus stickers.`,
    m,
    global.rcanal
  )
}

handler.help = ['#delstickermeta\n→ Restablece el pack y autor por defecto de tus stickers']
handler.tags = ['stickers']
handler.command = ['delstickermeta']

export default handler
