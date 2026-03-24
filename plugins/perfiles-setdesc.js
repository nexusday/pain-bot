let handler = async (m, { text}) => {
  if (!text)
    return conn.reply(m.chat, '[❗] Escribe una descripción\n> *Ejemplo:* #setdesc Soy una persona tranquila.', m, rcanal)

  global.db.data.users[m.sender].desc = text

  return conn.reply(m.chat, `🌴 Tu descripción ha sido guardada como *${text}*`, m, rcanal)
}
handler.help = ['#setdescription • #setdesc + [Descripción]\n→ Establece una descripción única para tu perfil']
handler.tags = ['perfiles']
handler.command = ['setdesc', 'setdescription']
export default handler
