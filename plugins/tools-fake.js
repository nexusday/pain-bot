const handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) return avisarUso(conn, m, usedPrefix, command)

  let who
  if (text.includes('@0')) who = '0@s.whatsapp.net'
  else if (m.isGroup) who = m.mentionedJid?.[0]
  else who = m.chat

  if (!who) return avisarUso(conn, m, usedPrefix, command)

  const sp = '@' + who.split('@')[0]
  const [fake, ...real] = text.split(sp)

  return conn.fakeReply(m.chat, real.join(sp).trimStart(), who, fake.trimEnd(), m.isGroup ? m.chat : false, {
    contextInfo: {
      mentionedJid: conn.parseMention(real.join(sp).trim())
    }
  })
}

handler.help = ['fake <texto> @usuario <respuesta>']
handler.tags = ['herramientas']
handler.command = ['fake', 'fakereply', 'fitnah']

export default handler

async function avisarUso(conn, m, usedPrefix, command) {
  const yo = '@' + String(m.sender || '').split('@')[0]
  return conn.sendMessage(m.chat, {
    text: `*[❗] Ejemplo:*\n> ${usedPrefix + command} hola ${yo} a`,
    contextInfo: {
      ...(global.rcanal?.contextInfo || {}),
      mentionedJid: [m.sender]
    }
  }, { quoted: m })
}
