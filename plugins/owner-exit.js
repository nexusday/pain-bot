let handler = async (m, { conn, usedPrefix, command, isOwner }) => {
  if (!isOwner) {
    return conn.sendMessage(m.chat, {
      text: '[❗ Este comando solo puede ser usado por el owner del bot.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }

  
  if (!m.chat.endsWith('@g.us')) {
    return conn.sendMessage(m.chat, {
      text: '[❗] Este comando solo funciona en grupos.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }

  try {
    
    await conn.sendMessage(m.chat, {
      text: 'Quería quedarme más tiempo pero mi dueño me dijo que no por motivos, adiós. 👋',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })


    await conn.groupLeave(m.chat)

  } catch (error) {
    console.error('Error al salir del grupo:', error)
    conn.sendMessage(m.chat, {
      text: `[❌] Error al salir del grupo: ${error.message || 'Desconocido'}`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.help = ['exit → Hace que el bot salga del grupo (solo owner)']
handler.tags = ['owner']
handler.command = ['exit', 'leave']
handler.owner = true

export default handler
