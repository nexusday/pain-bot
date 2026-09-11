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
    
    
    const todosParticipantes = participants.filter(p => p.id !== conn.user.jid)
    
    if (todosParticipantes.length < 2) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Se necesitan al menos 2 usuarios para crear parejas.',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    
    
    const pairs = []
    const maxPairs = Math.min(10, Math.floor(todosParticipantes.length / 2))
    const shuffledParticipants = [...todosParticipantes].sort(() => Math.random() - 0.5)
    
    for (let i = 0; i < maxPairs; i++) {
      const index1 = i * 2
      const index2 = index1 + 1
      
      if (index2 < shuffledParticipants.length) {
        pairs.push({
          user1: shuffledParticipants[index1],
          user2: shuffledParticipants[index2]
        })
      }
    }
    
    if (pairs.length === 0) {
      return conn.sendMessage(m.chat, {
        text: '[❌] No se pudieron crear parejas con los usuarios disponibles.',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    
    
    let texto = `💕 𝗧𝗼𝗽 𝗽𝗮𝗿𝗲𝗷𝗮𝘀 𝗱𝗲𝗹 𝗴𝗿𝘂𝗽𝗼\n\n`
    
   
    pairs.forEach((pair, indice) => {
      const posicion = indice + 1
      const emoji = posicion === 1 ? '🥇' : posicion === 2 ? '🥈' : posicion === 3 ? '🥉' : '💕'
      texto += `*${posicion}.* @${pair.user1.id.split('@')[0]} 💕 @${pair.user2.id.split('@')[0]}\n`
    })
    
    
    const jidsMencionados = pairs.flatMap(pair => [pair.user1.id, pair.user2.id])
    
    return conn.sendMessage(m.chat, {
      text: texto,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: jidsMencionados
      }
    }, { quoted: m })
    
  } catch (error) {
    console.error('Error en top parejas:', error)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error al generar el top de parejas del grupo.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.help = ['#topparejas']
handler.tags = ['fun', 'grupos']
handler.command = ['topparejas', 'toppareja', 'parejas', 'parejatop']
handler.group = true

export default handler 