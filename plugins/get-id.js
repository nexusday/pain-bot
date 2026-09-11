let handler = async (m, { conn, usedPrefix }) => {

  let quien = m.mentionedJid && m.mentionedJid[0] ? m.mentionedJid[0] : m.sender
  let usuario = global.db.data.users[quien]
  
  let texto = `ᬊ *Nombre:* ${usuario?.name || "Sin Registrar"}\nᬊ *ID:* ${quien}`
  
  await conn.sendMessage(m.chat, {
    text: texto,
    contextInfo: {
      ...rcanal.contextInfo
    }
  }, { quoted: m })
}

handler.help = ['#id • #getid\n→ Obtener ID del usuario actual o mencionado']
handler.tags = ['info']
handler.command = ['id', 'getid', 'detid']

export default handler 