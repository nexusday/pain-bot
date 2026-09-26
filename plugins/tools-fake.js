const handler = async (m, { conn, text, usedPrefix, command }) => {
  const limpio = String(text || '').trim()
  if (!limpio) return avisarUso(conn, m, usedPrefix, command)

  const quien = resolverQuien(m, limpio)
  if (!quien) return avisarUso(conn, m, usedPrefix, command)

  const partes = partirTexto(limpio, quien)
  if (!partes?.cita || !partes?.respuesta) return avisarUso(conn, m, usedPrefix, command)

  const menciones = typeof conn.parseMention === 'function'
    ? conn.parseMention(partes.respuesta)
    : []

  await conn.fakeReply(
    m.chat,
    partes.respuesta,
    quien,
    partes.cita,
    m.isGroup ? m.chat : false,
    {
      contextInfo: {
        mentionedJid: menciones
      }
    }
  )
}

handler.help = ['fake <texto> @usuario <respuesta>']
handler.tags = ['herramientas']
handler.command = ['fake', 'fakereply', 'fitnah']

export default handler

function digitos(jid) {
  return String(jid || '').split('@')[0].split(':')[0]
}

function resolverQuien(m, text) {
  if (text.includes('@0')) return '0@s.whatsapp.net'

  const menciones = Array.isArray(m.mentionedJid) ? m.mentionedJid.filter(Boolean) : []
  const coincidente = menciones.find((jid) => text.includes('@' + digitos(jid)))
  if (coincidente) return coincidente
  if (menciones[0]) return menciones[0]
  if (!m.isGroup) return m.chat
  return null
}

function partirTexto(text, quien) {
  const marca = '@' + digitos(quien)
  if (!text.includes(marca)) return null
  const [cita, ...resto] = text.split(marca)
  return {
    cita: cita.trim(),
    respuesta: resto.join(marca).trim()
  }
}

async function avisarUso(conn, m, usedPrefix, command) {
  const yo = '@' + digitos(m.sender)
  const texto = `*[❗] Uso incorrecto*\n\n> ${usedPrefix + command} hola ${yo} cómo estás\n\n_Lo que va antes de la mención es el mensaje falso. Lo que va después es la respuesta._`
  return conn.sendMessage(m.chat, {
    text: texto,
    contextInfo: {
      ...(global.rcanal?.contextInfo || {}),
      mentionedJid: [m.sender]
    }
  }, { quoted: m })
}
