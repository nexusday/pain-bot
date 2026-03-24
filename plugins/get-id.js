let handler = async (m, { conn, usedPrefix }) => {

  let who = m.mentionedJid && m.mentionedJid[0] ? m.mentionedJid[0] : m.sender
  let user = global.db.data.users[who]
  
  let txt = `ᬊ *Nombre:* ${user?.name || "Sin Registrar"}\nᬊ *ID:* ${who}`
  
  await conn.sendMessage(m.chat, {
    text: txt,
    contextInfo: {
      ...rcanal.contextInfo
    }
  }, { quoted: m })
}

handler.help = ['#id • #getid\n→ Obtener ID del usuario actual o mencionado']
handler.tags = ['info']
handler.command = ['id', 'getid', 'detid']

export default handler 