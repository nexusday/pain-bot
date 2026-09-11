let handler = async (m, { conn, args, participants, isAdmin, isBotAdmin, isOwner, isPrems, usedPrefix, command }) => {
  if (!m.isGroup) return conn.sendMessage(m.chat, {
    text: '《✧》Este comando solo puede ser usado en grupos.',
    contextInfo: {
      ...rcanal.contextInfo
    }
  }, { quoted: m })

  
  if (!global.db.data.notes) global.db.data.notes = {}
  if (!global.db.data.notes[m.chat]) global.db.data.notes[m.chat] = []

  const metadatosGrupo = await conn.groupMetadata(m.chat)
  const nombreGrupo = metadatosGrupo.subject

  
  const ahora = Date.now()
  global.db.data.notes[m.chat] = global.db.data.notes[m.chat].filter(nota => nota.expiresAt > ahora)

 
  if (m.mentionedJid && m.mentionedJid.length > 0) {
    const quien = m.mentionedJid[0]
    const notasUsuario = global.db.data.notes[m.chat].filter(nota => nota.author === quien)
    
    if (notasUsuario.length === 0) {
      return conn.sendMessage(m.chat, {
        text: `╭─「 📝 𝗡𝗼𝘁𝗮𝘀 𝗱𝗲 𝗨𝘀𝘂𝗮𝗿𝗶𝗼 📝 」─╮\n│\n╰➺ ✧ *Usuario:* @${quien.split('@')[0]}\n╰➺ ✧ *Notas:* 0 📝\n╰➺ ✧ *Estado:* Sin notas activas\n│\n╰➺ ✧ *Grupo:* ${nombreGrupo}\n\n> PAIN COMMUNITY`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [quien]
        }
      }, { quoted: m })
    }

    let textoNotas = `╭─「 📝 𝗡𝗼𝘁𝗮𝘀 𝗱𝗲 𝗨𝘀𝘂𝗮𝗿𝗶𝗼 📝 」─╮\n│\n`
    textoNotas += `╰➺ ✧ *Usuario:* @${quien.split('@')[0]}\n`
    textoNotas += `╰➺ ✧ *Notas:* ${notasUsuario.length} 📝\n│\n`
    
    notasUsuario.forEach((nota, index) => {
      const tiempoRestante = nota.expiresAt - ahora
      const horasRestantes = Math.floor(tiempoRestante / (60 * 60 * 1000))
      const minutosRestantes = Math.floor((tiempoRestante % (60 * 60 * 1000)) / (60 * 1000))
      
      textoNotas += `╰➺ ✧ *${index + 1}.* ${nota.content}\n`
      textoNotas += `   ↳ Tiempo restante: ${horasRestantes}h ${minutosRestantes}m\n`
    })
    
    textoNotas += `│\n╰➺ ✧ *Grupo:* ${nombreGrupo}\n\n> PAIN COMMUNITY`

    const usuariosMencionados = [quien, ...notasUsuario.map(n => n.author)]
    
    return conn.sendMessage(m.chat, {
      text: textoNotas,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: usuariosMencionados
      }
    }, { quoted: m })
  }


  const todasLasNotas = global.db.data.notes[m.chat]

  if (todasLasNotas.length === 0) {
    return conn.sendMessage(m.chat, {
      text: `╭─「 📝 𝗡𝗼𝘁𝗮𝘀 𝗱𝗲𝗹 𝗚𝗿𝘂𝗽𝗼 📝 」─╮\n│\n╰➺ ✧ *Grupo:* ${nombreGrupo}\n╰➺ ✧ *Notas activas:* 0\n╰➺ ✧ *Estado:* Sin notas 📝\n│\n╰➺ ✧ *Nota:* No hay notas activas en este grupo.\n\n> PAIN COMMUNITY`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }

  let textoNotasGrupo = `╭─「 📝 𝗡𝗼𝘁𝗮𝘀 𝗱𝗲𝗹 𝗚𝗿𝘂𝗽𝗼 📝 」─╮\n│\n`
  textoNotasGrupo += `╰➺ ✧ *Grupo:* ${nombreGrupo}\n`
  textoNotasGrupo += `╰➺ ✧ *Notas activas:* ${todasLasNotas.length}\n│\n`

  const usuariosMencionados = []
  
  for (let i = 0; i < todasLasNotas.length; i++) {
    const nota = todasLasNotas[i]
    const tiempoRestante = nota.expiresAt - ahora
    const horasRestantes = Math.floor(tiempoRestante / (60 * 60 * 1000))
    const minutosRestantes = Math.floor((tiempoRestante % (60 * 60 * 1000)) / (60 * 1000))
    
    usuariosMencionados.push(nota.author)
    
    textoNotasGrupo += `╰➺ ✧ *${i + 1}.* ${nota.content}\n`
    textoNotasGrupo += `   ↳ Por: @${nota.author.split('@')[0]} | ${horasRestantes}h ${minutosRestantes}m\n`
    
    if (i < todasLasNotas.length - 1) {
      textoNotasGrupo += `│\n`
    }
  }
  
  textoNotasGrupo += `│\n╰➺ ✧ *Comando:* ${usedPrefix}vernotas @usuario\n`
  textoNotasGrupo += `╰➺ ✧ *Para ver notas de un usuario específico*\n\n> PAIN COMMUNITY`

  return conn.sendMessage(m.chat, {
    text: textoNotasGrupo,
    contextInfo: {
      ...rcanal.contextInfo,
      mentionedJid: usuariosMencionados
    }
  }, { quoted: m })
}

handler.command = ['vernotas', 'notes', 'vernotas', 'listnotes']
handler.group = true

export default handler
