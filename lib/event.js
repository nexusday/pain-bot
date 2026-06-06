export async function handleGroupEvents(m, conn, _isAdmin, _isBotAdmin, _isOwner, _participants) {
  
  if (!m.isGroup) return

  
  const text = m.text?.toLowerCase().trim()
  if (!text) return

  
  const groupMetadata = await conn.groupMetadata(m.chat).catch(_ => (conn.chats[m.chat] || {}).metadata || {})
  const participants = (m.isGroup ? groupMetadata.participants : []) || []
  const user = (m.isGroup ? participants.find(u => conn.decodeJid(u.id) === m.sender) : {}) || {}
  const bot = (m.isGroup ? participants.find(u => conn.decodeJid(u.id) == conn.user.jid) : {}) || {}
  const isRAdmin = user?.admin == 'superadmin' || false
  const isAdmin = isRAdmin || user?.admin == 'admin' || false
  const isBotAdmin = bot?.admin || false

  
  const createOwnerIds = (number) => {
    const cleanNumber = number.replace(/[^0-9]/g, '')
    return [
      cleanNumber + '@s.whatsapp.net',
      cleanNumber + '@lid'
    ]
  }

  const allOwnerIds = [
    conn.decodeJid(conn.user.id),
    ...global.owner.flatMap(([number]) => createOwnerIds(number)),
    ...(global.ownerLid || []).flatMap(([number]) => createOwnerIds(number))
  ]

  const isROwner = allOwnerIds.includes(m.sender)
  const isOwner = isROwner || m.fromMe

  
  const isAllowed = isAdmin || isOwner
  if (!isAllowed) return

  if (text === 'abrir') {
    if (!groupMetadata.announce) return 
    try {
      await conn.groupSettingUpdate(m.chat, 'not_announcement')
      await conn.sendMessage(m.chat, {
        text: `🌴 Grupo abierto por ${m.name || 'un admin'}.`,
        contextInfo: {
          ...global.rcanal.contextInfo
        }
      }, { quoted: m })
    } catch (e) {
      console.error('Error abriendo grupo:', e)
    }
  } else if (text === 'cerrar') {
    if (groupMetadata.announce) return 
    try {
      await conn.groupSettingUpdate(m.chat, 'announcement')
      await conn.sendMessage(m.chat, {
        text: `🌴 Grupo cerrado por ${m.name || 'un admin'}.`,
        contextInfo: {
          ...global.rcanal.contextInfo
        }
      }, { quoted: m })
    } catch (e) {
      console.error('Error cerrando grupo:', e)
    }
  }
  else if (text === 'del' || text === 'delete' || text === 'eliminar') {
    // silent delete: remove quoted message and the command message without sending texts
    if (!m.quoted) return

    // prefer the isBotAdmin value passed from handler, fallback to local calculation
    const botIsAdmin = typeof _isBotAdmin !== 'undefined' ? _isBotAdmin : isBotAdmin
    if (!botIsAdmin) return

    try {
      // try multiple ways to get the quoted message id and participant
      const quotedKey = m.quoted?.key || m.msg?.contextInfo
      const messageId = quotedKey?.id || m.quoted?.id || m.msg?.contextInfo?.stanzaId
      const participant = quotedKey?.participant || m.msg?.contextInfo?.participant || m.quoted?.participant || m.sender

      if (messageId) {
        await conn.sendMessage(m.chat, { delete: { remoteJid: m.chat, fromMe: false, id: messageId, participant: participant } }).catch(() => {})
      }

      // delete the command message
      const cmdId = m.key?.id
      if (cmdId) await conn.sendMessage(m.chat, { delete: { remoteJid: m.chat, fromMe: false, id: cmdId, participant: m.sender } }).catch(() => {})
    } catch (err) {
      console.error('Error al procesar del en event.js:', err)
    }
    return
  }
}
