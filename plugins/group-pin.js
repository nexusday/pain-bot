const PIN_DURATIONS = {
  '1d': 86400,
  '24h': 86400,
  '7d': 604800,
  '30d': 2592000
}

function resolveQuotedKey(m, conn) {
  const quoted = m.getQuotedObj?.() || null
  const messageId = m.msg?.contextInfo?.stanzaId || m.quoted?.id || quoted?.id || quoted?.key?.id

  if (!messageId) return null

  const fromMe = Boolean(
    m.quoted?.fromMe ??
    quoted?.key?.fromMe ??
    quoted?.fromMe ??
    false
  )

  let participant = m.msg?.contextInfo?.participant ||
    m.quoted?.sender ||
    quoted?.key?.participant ||
    quoted?.sender ||
    null

  if (participant) participant = conn.decodeJid(participant)
  if (!fromMe && !participant && m.isGroup) return null

  const key = {
    remoteJid: m.chat,
    fromMe,
    id: messageId
  }

  if (participant && !fromMe) key.participant = participant
  return key
}

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

let handler = async (m, { conn, args, isAdmin, isBotAdmin, usedPrefix, command }) => {
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

  if (!isBotAdmin) {
    return conn.sendMessage(m.chat, {
      text: '[❗] Necesito ser *administradora* del grupo para fijar mensajes.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  if (!m.quoted) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Respondé al mensaje que quieres fijar.\n\n> Ejemplo: respondé un mensaje y escribe ${usedPrefix + command}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const pinKey = resolveQuotedKey(m, conn)
  if (!pinKey) {
    return conn.sendMessage(m.chat, {
      text: '[❌] No se pudo obtener la información del mensaje a fijar.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const time = parsePinDuration(args)

  try {
    await conn.sendMessage(m.chat, {
      pin: pinKey,
      type: 1,
      time
    })

    const groupName = (await conn.groupMetadata(m.chat).catch(() => null))?.subject || 'Grupo'

    return conn.sendMessage(m.chat, {
      text: `☾. 𝗠𝗲𝗻𝘀𝗮𝗷𝗲 𝗳𝗶𝗷𝗮𝗱𝗼 𝗰𝗼𝗿𝗿𝗲𝗰𝘁𝗮𝗺𝗲𝗻𝘁𝗲.\n\n> *Grupo:* ${groupName}\n> *Duración:* ${formatDuration(time)}\n> *Por:* @${m.sender.split('@')[0]}`,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender]
      }
    }, { quoted: m })
  } catch (e) {
    console.error('Error al fijar mensaje:', e)
    return conn.sendMessage(m.chat, {
      text: '[❌] No se pudo fijar el mensaje. Verificá que el bot sea admin y que el mensaje sea válido.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.command = ['fijar', 'pin', 'fijarmensaje', 'fijarmsj']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler
