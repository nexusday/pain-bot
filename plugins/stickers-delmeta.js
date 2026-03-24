let handler = async (m) => {
  let user = global.db.data.users[m.sender]

  user.packname = ''
  user.author = ''

  return conn.reply(m.chat, `✐ Se restablecieron el *pack* y *autor* por defecto para tus stickers.`, m, rcanal)
}

handler.help = ['#delstickermeta • #delmeta\n→ Restablece el pack y autor por defecto de tus stickers']
handler.tags = ['stickers']
handler.command = ['delstickermeta', 'delmeta']

export default handler
