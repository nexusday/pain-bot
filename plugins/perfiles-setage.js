let handler = async (m, { conn, args, usedPrefix, command }) => {
  const ayuda = `[❗] Indica tu edad.\n> *Ejemplo:* ${usedPrefix + command} 18`

  const crudo = String(args[0] || '').trim()
  if (!crudo) return conn.reply(m.chat, ayuda, m, rcanal)

  const edad = parseInt(crudo.replace(/\D/g, ''), 10)
  if (!Number.isFinite(edad) || edad < 5 || edad > 120) {
    return conn.reply(m.chat, `[❗] Edad inválida (5–120).\n> *Ejemplo:* ${usedPrefix + command} 18`, m, rcanal)
  }

  if (!global.db.data.users[m.sender]) global.db.data.users[m.sender] = {}
  global.db.data.users[m.sender].age = edad

  return conn.reply(m.chat, `✅ Tu edad quedó en *${edad}* años.`, m, rcanal)
}

handler.help = ['setage <edad>']
handler.tags = ['perfiles']
handler.command = ['setage', 'setedad', 'edad']

export default handler
