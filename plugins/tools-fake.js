import { areJidsSameUser } from '@whiskeysockets/baileys'

const handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) return avisar(conn, m, usedPrefix, command)

  const copia = copiar(m)
  let quien
  if (text.includes('@0')) quien = '0@s.whatsapp.net'
  else if (m.isGroup) quien = copia.participant = m.mentionedJid[0]
  else quien = m.chat

  if (!quien) return avisar(conn, m, usedPrefix, command)

  copia.key.fromMe = false
  copia.message[m.mtype] = copiar(m.msg)
  const marca = '@' + quien.split('@')[0]
  const [falso, ...real] = text.split(marca)
  const respuesta = real.join(marca).trimStart()
  const cita = falso.trimEnd()

  return conn.sendMessage(m.chat, {
    text: respuesta,
    contextInfo: {
      mentionedJid: conn.parseMention(real.join(marca).trim())
    }
  }, {
    keepQuoted: true,
    quoted: {
      key: {
        fromMe: areJidsSameUser(quien, conn.user?.id),
        participant: quien,
        ...(m.isGroup ? { remoteJid: m.chat } : {})
      },
      message: { conversation: cita },
      contextInfo: {
        mentionedJid: conn.parseMention(real.join(marca).trim())
      }
    }
  })
}

handler.help = ['fake <texto> @usuario <texto2>']
handler.tags = ['herramientas']
handler.command = ['fake', 'fakereply', 'fitnah']

export default handler

function copiar(obj) {
  return JSON.parse(JSON.stringify(obj))
}

async function avisar(conn, m, usedPrefix, command) {
  const yo = '@' + m.sender.split('@')[0]
  return conn.sendMessage(m.chat, {
    text: `*[❗] Ejemplo:*\n> ${usedPrefix + command} hola ${yo} a`,
    contextInfo: {
      ...(global.rcanal?.contextInfo || {}),
      mentionedJid: [m.sender]
    }
  }, { quoted: m, keepQuoted: true })
}
