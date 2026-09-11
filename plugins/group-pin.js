import { findGroupParticipant } from '../lib/group-participant.js'

const DURACIONES_PIN = {
  '1d': 86400,
  '24h': 86400,
  '7d': 604800,
  '30d': 2592000
}

const COMANDOS_DESFIJAR = new Set(['desfijar', 'despin', 'unfijar', 'unpin', 'desfijarmsj'])

function parsearDuracionPin(args) {
  const valor = (args[0] || '').toLowerCase().trim()
  return DURACIONES_PIN[valor] || 604800
}

function formatearDuracion(seconds) {
  if (seconds === 86400) return '24 horas'
  if (seconds === 604800) return '7 días'
  if (seconds === 2592000) return '30 días'
  return `${Math.round(seconds / 3600)} horas`
}

function construirClavePin(m, conn) {
  const idMensaje = m.msg?.contextInfo?.stanzaId || m.quoted?.id
  if (!idMensaje) return null

  const participante = m.msg?.contextInfo?.participant || m.quoted?.sender || m.sender
  const fromMe = Boolean(m.quoted?.fromMe)

  const clavePin = {
    remoteJid: m.chat,
    fromMe,
    id: idMensaje
  }

  if (!fromMe) {
    clavePin.participant = conn.decodeJid(participante) || participante
  }

  return clavePin
}

let handler = async (m, { conn, args, participants, isAdmin, isBotAdmin, isOwner, isPrems, usedPrefix, command }) => {
  const metadatosVerificacionAdmin = (m.isGroup ? ((conn.chats[m.chat] || {}).metadata || await conn.groupMetadata(m.chat).catch(_ => null)) : {}) || {}
  const participantesGrupo = (m.isGroup ? metadatosVerificacionAdmin.participants : []) || []
  const usuario = (m.isGroup ? findGroupParticipant(participantesGrupo, m, conn) : {}) || {}
  const esSuperAdmin = usuario?.admin == 'superadmin' || false
  const esAdminManual = Boolean(isAdmin) || esSuperAdmin || usuario?.admin == 'admin' || false

  const esOwnerManual = global.owner.some(([numero]) => numero.replace(/[^0-9]/g, '') + '@s.whatsapp.net' === m.sender) ||
    global.ownerLid?.some(([numero]) => numero.replace(/[^0-9]/g, '') + '@lid' === m.sender) ||
    m.sender === conn.user.jid

  if (!esAdminManual && !esSuperAdmin && !esOwnerManual) {
    return conn.reply(m.chat, '[❗] Solo los administradores pueden usar este comando.', m)
  }

  if (!m.isGroup) {
    return conn.sendMessage(m.chat, {
      text: '[❗] Este comando solo puede ser usado en grupos.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const esDesfijar = COMANDOS_DESFIJAR.has(command)

  if (!m.quoted) {
    return conn.sendMessage(m.chat, {
      text: esDesfijar
        ? `[❗] Debes responder al mensaje que deseas desfijar.\n\n> Ejemplo: Responde a un mensaje y escribe ${usedPrefix + command}`
        : `[❗] Debes responder al mensaje que deseas fijar.\n\n> Ejemplo: Responde a un mensaje y escribe ${usedPrefix + command}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  try {
    const clavePin = construirClavePin(m, conn)

    if (!clavePin) {
      return conn.sendMessage(m.chat, {
        text: esDesfijar
          ? '[❌] No se pudo obtener información del mensaje a desfijar.'
          : '[❌] No se pudo obtener información del mensaje a fijar.',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    if (esDesfijar) {
      await conn.sendMessage(m.chat, {
        pin: clavePin,
        type: 2
      })
    } else {
      await conn.sendMessage(m.chat, {
        pin: clavePin,
        type: 1,
        time: parsearDuracionPin(args)
      })
    }

    const nombreGrupo = (await conn.groupMetadata(m.chat).catch(() => null))?.subject || 'Grupo'

    return conn.sendMessage(m.chat, {
      text: esDesfijar
        ? `☾. 𝗠𝗲𝗻𝘀𝗮𝗷𝗲 𝗱𝗲𝘀𝗳𝗶𝗷𝗮𝗱𝗼 𝗰𝗼𝗿𝗿𝗲𝗰𝘁𝗮𝗺𝗲𝗻𝘁𝗲.\n\n> *Grupo:* ${nombreGrupo}\n> *Por:* @${m.sender.split('@')[0]}`
        : `☾. 𝗠𝗲𝗻𝘀𝗮𝗷𝗲 𝗳𝗶𝗷𝗮𝗱𝗼 𝗰𝗼𝗿𝗿𝗲𝗰𝘁𝗮𝗺𝗲𝗻𝘁𝗲.\n\n> *Grupo:* ${nombreGrupo}\n> *Duración:* ${formatearDuracion(parsearDuracionPin(args))}\n> *Por:* @${m.sender.split('@')[0]}`,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender]
      }
    }, { quoted: m })
  } catch (e) {
    console.error(esDesfijar ? 'Error al desfijar mensaje:' : 'Error al fijar mensaje:', e)
  }
}

handler.command = [
  'fijar', 'pin', 'fijarmensaje', 'fijarmsj',
  'desfijar', 'despin', 'unfijar', 'unpin', 'desfijarmsj'
]
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler
