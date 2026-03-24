let handler = async (m) => {
  if (!global.db.data.users[m.sender].birth)
    return conn.reply(m.chat, '[❗] No tienes un cumpleaños registrado por el momento.', m, rcanal)
    
  delete global.db.data.users[m.sender].birth
  return conn.reply(m.chat, '「✐」Se ha eliminado tu cumpleaños correctamente.', m, rcanal)
}
handler.help = ['#delbirth + [fecha]\n→ Borra tu fecha de nacimiento de tu perfil']
handler.tags = ['perfiles']
handler.command = ['delbirth']
export default handler
