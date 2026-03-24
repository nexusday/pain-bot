let handler = async (m, { conn, args, usedPrefix, command, isOwner }) => {
  if (!isOwner) {
    return conn.sendMessage(m.chat, {
      text: '[❗] Este comando solo puede ser usado por el owner del bot.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }

  if (!args[0]) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Uso correcto: ${usedPrefix}${command} <link del grupo>\n\nEjemplo: ${usedPrefix}${command} https://chat.whatsapp.com/ABC123`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }

  let link = args[0].trim()

  
  const inviteCode = link.match(/chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9]+)/)?.[1]

  if (!inviteCode) {
    return conn.sendMessage(m.chat, {
      text: '[❌] Link de invitación inválido. Usa el formato: https://chat.whatsapp.com/<código>',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }

  let groupInfo = null

  try {
    

    groupInfo = await conn.groupGetInviteInfo(inviteCode)
    
    
    try {
      const metadata = await conn.groupMetadata(groupInfo.id)
    
      return conn.sendMessage(m.chat, {
        text: `[❌] El bot ya está en ese grupo: ${metadata.subject}`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    } catch (e) {
      if (e.data !== 403) {
        
        throw e
      }
      
    }
    
    
    await conn.groupAcceptInvite(inviteCode)

    if (groupInfo.joinApprovalMode) {
      conn.sendMessage(m.chat, {
        text: '[✅] Solicitud de unión enviada. El bot está esperando aprobación de un administrador.',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    } else {
      conn.sendMessage(m.chat, {
        text: '[✅] Bot se ha unido exitosamente al grupo.',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

  } catch (error) {
    console.error('Error al unirse al grupo:', error)
    
    let errorMsg = error.message || 'Desconocido'
    if (errorMsg === 'not-authorized') {
      errorMsg = 'El bot fue eliminado del grupo por alguien y no puede unirse.'
    }
    
    conn.sendMessage(m.chat, {
      text: `[❌] Error al unirse al grupo: ${errorMsg}`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.help = ['join <link> → Hace que el bot se una a un grupo (solo owner)']
handler.tags = ['owner']
handler.command = ['join']
handler.owner = true

export default handler
