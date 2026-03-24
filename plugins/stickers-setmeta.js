let handler = async (m, { text }) => {
  if (!text || !text.trim()) {
    return conn.reply(m.chat, `[❗] Por favor, escribe el *pack* y/o el *autor* que deseas usar por defecto para tus stickers.\n> Ejemplo: *Forger* | Stickers`, m, rcanal)
  }

  let packname, author
  let parts = text.split('|')

  packname = parts[0]?.trim()
  author = parts[1]?.trim()

  if (!packname && !author) {
    return conn.reply(m.chat, `[❗] No se detectó ningún dato válido. Usa el formato:\n> *pack* | autor\n> Ejemplo: *Forger* | Stickers`, m, rcanal)
  }

  let user = global.db.data.users[m.sender]

  if (typeof packname === 'string') user.packname = packname || user.packname
  if (typeof author === 'string') user.author = author || user.author

  return conn.reply(m.chat, `✐ Se actualizó el *pack* y/o *autor* por defecto para tus stickers.${
    packname ? `\n> Pack: *${user.packname}*` : ''
  }${author ? `\n> Autor: *${user.author}*` : ''}`, m, rcanal)
}

handler.help = ['#setstickermeta • #setmeta + [autor] | [pack]\n→ Define el autor y nombre del pack para tus stickers']
handler.tags = ['stickers']
handler.command = ['setstickermeta', 'setmeta']

export default handler
