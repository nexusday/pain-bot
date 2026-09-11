let handler = async (m, { conn, args, participants, isAdmin, isBotAdmin, isOwner, isPrems, usedPrefix, command }) => {
  if (!m.isGroup) return conn.sendMessage(m.chat, {
    text: '[❗] Este comando solo puede ser usado en grupos.',
    contextInfo: {
      ...rcanal.contextInfo
    }
  }, { quoted: m })

  try {
    
    const metadatosGrupo = await conn.groupMetadata(m.chat)
    const participants = metadatosGrupo.participants || []
    
    
    const usuarios = participants.filter(p => !p.admin && p.id !== conn.user.jid)
    
    
    const todosParticipantes = participants.filter(p => p.id !== conn.user.jid)
    
   
    const usuariosSeleccionados = []
    const maxUsuarios = Math.min(10, todosParticipantes.length)
    
    for (let i = 0; i < maxUsuarios; i++) {
      const indiceAleatorio = Math.floor(Math.random() * todosParticipantes.length)
      const usuario = todosParticipantes[indiceAleatorio]
      
      
      if (!usuariosSeleccionados.find(u => u.id === usuario.id)) {
        usuariosSeleccionados.push(usuario)
      } else {
        i-- 
      }
    }
    
    if (usuariosSeleccionados.length === 0) {
      return conn.sendMessage(m.chat, {
        text: '[❗] No hay suficientes usuarios en el grupo para crear el top.',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    
   
    let texto = `😍 𝗧𝗼𝗽 𝗹𝗶𝗻𝗱𝗼𝘀 𝗱𝗲𝗹 𝗴𝗿𝘂𝗽𝗼\n`  
    
    usuariosSeleccionados.forEach((usuario, indice) => {
      const posicion = indice + 1
      const emoji = posicion === 1 ? '🥇' : posicion === 2 ? '🥈' : posicion === 3 ? '🥉' : '💖'
      texto += `*${posicion}.* @${usuario.id.split('@')[0]}\n`
    })
    
    
   
    const jidsMencionados = usuariosSeleccionados.map(usuario => usuario.id)
    
    return conn.sendMessage(m.chat, {
      text: texto,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: jidsMencionados
      }
    }, { quoted: m })
    
  } catch (error) {
    console.error('Error en top lindos:', error)
    return conn.sendMessage(m.chat, {
      text: '[❗] Ocurrió un error al generar el top de lindos del grupo.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.help = ['#toplindos']
handler.tags = ['fun', 'grupos']
handler.command = ['toplindos', 'toplindo', 'lindos', 'lindotop']
handler.group = true

export default handler 