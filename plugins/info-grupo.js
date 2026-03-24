let handler = async (m, { conn, usedPrefix, command }) => {
  
  if (!m.chat.endsWith('@g.us')) {
    return conn.sendMessage(m.chat, {
      text: '[❗] Este comando solo funciona en grupos.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }

  try {
    
    const metadata = await conn.groupMetadata(m.chat)
    
    const {
      subject: name,
      owner,
      creation,
      desc,
      participants
    } = metadata


    const totalMembers = participants.length

    
    const admins = participants.filter(p => p.admin === 'admin').map(p => p.id)

    
    const ownersList = [...(global.owner || []).map(o => o[0]), ...(global.ownerLid || []).map(o => o[0])]
    const ownersInGroup = participants.filter(p => ownersList.includes(p.id.split('@')[0].split(':')[0])).map(p => p.id)
    
    
    const creationDate = new Date(creation * 1000).toLocaleString('es-ES')

    
    const descLength = desc ? desc.length : 0

    
    let mentions = []
    if (owner) mentions.push(owner)
    if (admins.length > 0) mentions.push(...admins)
    if (ownersInGroup.length > 0) mentions.push(...ownersInGroup)

    
    let infoText = `
╭───「 ✦ 𝙄𝙉𝙁𝙊 𝙂𝙍𝙐𝙋𝙊 ✦ 」
│
│  *Nombre:* ${name || 'Sin nombre'}
│  *Creador:* @${owner ? owner.split('@')[0] : 'Desconocido'}
│  *Creado:* ${creationDate}
│  *Miembros:* ${totalMembers}
│  *Descripción:* ${descLength} caracteres
│
│  *Admins (${admins.length}):*
${admins.length > 0 ? admins.map(a => `│  • @${a.split('@')[0]}`).join('\n') : '│  • Ninguno'}
│
│  *Owners del bot:*
${ownersInGroup.length > 0 ? ownersInGroup.map(o => `│  • @${o.split('@')[0]}`).join('\n') : '│  • Los owners no están en este grupo'}
`.trim()

    
    try {
      const groupPic = await conn.profilePictureUrl(m.chat, 'image')
      if (groupPic) {
        conn.sendMessage(m.chat, {
          image: { url: groupPic },
          caption: infoText,
          contextInfo: {
            mentionedJid: mentions,
            ...rcanal.contextInfo
          }
        }, { quoted: m })
        return
      }
    } catch (e) {
      
    }

    
    conn.sendMessage(m.chat, {
      text: infoText,
      contextInfo: {
        mentionedJid: mentions,
        ...rcanal.contextInfo
      }
    }, { quoted: m })

  } catch (error) {
    console.error('Error en infogrupo:', error)
    conn.sendMessage(m.chat, {
      text: `[❌] Error al obtener información del grupo: ${error.message || 'Desconocido'}`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.help = ['infogrupo → Muestra información completa del grupo']
handler.tags = ['group', 'info']
handler.command = ['infogrupo', 'infogp', 'groupinfo']

export default handler
