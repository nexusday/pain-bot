let handler = async (m, { args }) => {
  let genero = args[0]?.toLowerCase()
  if (!genero || !['hombre', 'mujer'].includes(genero)) {
    return conn.reply(m.chat, '[❗] Debes ingresar un género valido.\n> *Ejemplo:*  #setgenre hombre', m, rcanal)
  }

  global.db.data.users[m.sender].genre = genero

  return conn.reply(m.chat, `🌴 Se ha establecido tu género en *${genero}*!`, m, rcanal)
}
handler.help = ['#setgenre + Hombre | Mujer\n→ Establece tu género para personalizar tu experiencia']
handler.tags = ['perfiles']
handler.command = ['setgenre']
export default handler
