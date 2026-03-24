let handler = async (m) => {
  if (!global.db.data.users[m.sender].genre)
    return conn.reply(m.chat, '[❗] No tienes un género establecido.', m, rcanal)

  delete global.db.data.users[m.sender].genre

  return conn.reply(m.chat, `✐ Tu género ha sido eliminado.`, m, rcanal)
}
handler.help = ['#delgenre\n→ Elimina tu género del perfil']
handler.tags = ['perfiles']
handler.command = ['delgenre']
export default handler
