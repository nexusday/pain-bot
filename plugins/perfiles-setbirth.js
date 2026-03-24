let handler = async (m, { conn, args, command, usedPrefix }) => {
  const textoAyuda = `
[❗] Debes ingresar una fecha válida para tu cumpleaños\n> *Ejemplo:* ${usedPrefix + command} 01/10/2009 (día/mes/año)`.trim()

  let fecha = args.join(' ').trim()
  if (!fecha) return conn.reply(m.chat, textoAyuda, m, rcanal)

  const regex = /^(0?[1-9]|[12][0-9]|3[01])[\/\-](0?[1-9]|1[0-2])([\/\-](\d{4}))?$|^\d{1,2}\s+[a-zA-Z]+$/i
  if (!regex.test(fecha)) return conn.reply(m.chat, textoAyuda, m, rcanal)

  let user = global.db.data.users[m.sender]
  if (!user) global.db.data.users[m.sender] = {}

  if (user.birth) {
    return conn.reply(m.chat, `[❗] Ya has establecido tu cumpleaños\n> Si deseas borrarlo, usa: *#delbirth*`, m, rcanal)
  }

  global.db.data.users[m.sender].birth = fecha
}

handler.help = ['#setbirth + [fecha]\n→ Guarda tu fecha de nacimiento en tu perfil de usuario']
handler.tags = ['perfiles']
handler.command = ['setbirth']
export default handler
