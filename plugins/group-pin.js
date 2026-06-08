const PIN_DURATIONS = {
  '1d': 86400,
  '24h': 86400,
  '7d': 604800,
  '30d': 2592000
}

const UNPIN_COMMANDS = new Set(['desfijar', 'despin', 'unfijar', 'unpin', 'desfijarmsj'])

function parsePinDuration(args) {
  const value = (args[0] || '').toLowerCase().trim()
  return PIN_DURATIONS[value] || 604800
}

function formatDuration(seconds) {
  if (seconds === 86400) return '24 horas'
  if (seconds === 604800) return '7 días'
  if (seconds === 2592000) return '30 días'
  return `${Math.round(seconds / 3600)} horas`
}

function buildPinKey(m, conn) {
  const messageId = m.msg?.contextInfo?.stanzaId || m.quoted?.id
  if (!messageId) return null

  const participant = m.msg?.contextInfo?.participant || m.quoted?.sender || m.sender
  const fromMe = Boolean(m.quoted?.fromMe)

  const pinKey = {
    remoteJid: m.chat,
    fromMe,
    id: messageId
  }

  if (!fromMe) {
    pinKey.participant = conn.decodeJid(participant) || participant
  }

  return pinKey
}

let handler = async (m, { conn, args, participants, isAdmin, isBotAdmin, isOwner, isPrems, usedPrefix, command }) => {
  const adminCheckMetadata = (m.isGroup ? ((conn.chats[m.chat] || {}).metadata || await conn.groupMetadata(m.chat).catch(_ => null)) : {}) || {}
  const groupParticipants = (m.isGroup ? adminCheckMetadata.participants : []) || []
  const user = (m.isGroup ? groupParticipants.find(u => conn.decodeJid(u.id) === m.sender) : {}) || {}
  const isRAdmin = user?.admin == 'superadmin' || false
  const isAdminManual = isRAdmin || user?.admin == 'admin' || false

  const isOwnerManual = global.owner.some(([number]) => number.replace(/[^0-9]/g, '') + '@s.whatsapp.net' === m.sender) ||
    global.ownerLid?.some(([number]) => number.replace(/[^0-9]/g, '') + '@lid' === m.sender) ||
    m.sender === conn.user.jid

  if (!isAdminManual && !isRAdmin && !isOwnerManual) {
    return conn.reply(m.chat, '[❗] Solo los administradores pueden usar este comando.', m)
  }

  if (!m.isGroup) {
    return conn.sendMessage(m.chat, {
      text: '[❗] Este comando solo puede ser usado en grupos.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const isUnpin = UNPIN_COMMANDS.has(command)

  if (!m.quoted) {
    return conn.sendMessage(m.chat, {
      text: isUnpin
        ? `[❗] Debes responder al mensaje que deseas desfijar.\n\n> Ejemplo: Responde a un mensaje y escribe ${usedPrefix + command}`
        : `[❗] Debes responder al mensaje que deseas fijar.\n\n> Ejemplo: Responde a un mensaje y escribe ${usedPrefix + command}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  try {
    const pinKey = buildPinKey(m, conn)

    if (!pinKey) {
      return conn.sendMessage(m.chat, {
        text: isUnpin
          ? '[❌] No se pudo obtener información del mensaje a desfijar.'
          : '[❌] No se pudo obtener información del mensaje a fijar.',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    if (isUnpin) {
      await conn.sendMessage(m.chat, {
        pin: pinKey,
        type: 2
      })
    } else {
      await conn.sendMessage(m.chat, {
        pin: pinKey,
        type: 1,
        time: parsePinDuration(args)
      })
    }

    const groupName = (await conn.groupMetadata(m.chat).catch(() => null))?.subject || 'Grupo'

    return conn.sendMessage(m.chat, {
      text: isUnpin
        ? `☾. 𝗠𝗲𝗻𝘀𝗮𝗷𝗲 𝗱𝗲𝘀𝗳𝗶𝗷𝗮𝗱𝗼 𝗰𝗼𝗿𝗿𝗲𝗰𝘁𝗮𝗺𝗲𝗻𝘁𝗲.\n\n> *Grupo:* ${groupName}\n> *Por:* @${m.sender.split('@')[0]}`
        : `☾. 𝗠𝗲𝗻𝘀𝗮𝗷𝗲 𝗳𝗶𝗷𝗮𝗱𝗼 𝗰𝗼𝗿𝗿𝗲𝗰𝘁𝗮𝗺𝗲𝗻𝘁𝗲.\n\n> *Grupo:* ${groupName}\n> *Duración:* ${formatDuration(parsePinDuration(args))}\n> *Por:* @${m.sender.split('@')[0]}`,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender]
      }
    }, { quoted: m })
  } catch (e) {
    console.error(isUnpin ? 'Error al desfijar mensaje:' : 'Error al fijar mensaje:', e)
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
