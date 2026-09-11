let handler = async (m, { conn, args, participants, isAdmin, isBotAdmin, isOwner, isPrems, usedPrefix, command }) => {
  if (!m.isGroup) return conn.sendMessage(m.chat, {
    text: '[❗] Este comando solo puede ser usado en grupos.',
    contextInfo: {
      ...rcanal.contextInfo
    }
  }, { quoted: m })
  
  if (!global.db.data.warnings) global.db.data.warnings = {}
  if (!global.db.data.warnings[m.chat]) global.db.data.warnings[m.chat] = {}

  const metadatosGrupo = await conn.groupMetadata(m.chat)
  const nombreGrupo = metadatosGrupo.subject

  if (m.mentionedJid && m.mentionedJid.length > 0) {
    const quien = m.mentionedJid[0]
    const advertenciasUsuario = global.db.data.warnings[m.chat][quien]
    
    if (!advertenciasUsuario || advertenciasUsuario.count === 0) {
      return conn.sendMessage(m.chat, {
        text: `🌴 𝗔𝗱𝘃𝗲𝗿𝘁𝗲𝗻𝗰𝗶𝗮𝘀\n\n> *Usuario:* @${quien.split('@')[0]}\n> *Advertencias:* 0/3`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [quien]
        }
      }, { quoted: m })
    }

    let textoAdvertencias = `𝗔𝗱𝘃𝗲𝗿𝘁𝗲𝗻𝗰𝗶𝗮𝘀 𝗱𝗲 𝗨𝘀𝘂𝗮𝗿𝗶𝗼\n> *Usuario:* @${quien.split('@')[0]}> *Advertencias:* ${advertenciasUsuario.count}/3 ${advertenciasUsuario.count >= 2 ? '⚠️' : '📋'}`
    
    advertenciasUsuario.warnings.forEach((adv, index) => {
      const date = new Date(adv.timestamp).toLocaleDateString('es-ES')
      const nombreAdmin = adv.admin.split('@')[0]
      textoAdvertencias += `> *${index + 1}.* ${adv.reason}\n`
      textoAdvertencias += `> *Admin:* @${nombreAdmin} | ${date}\n`
    })
    
    textoAdvertencias += `> *Grupo:* ${nombreGrupo}\n`
    if (advertenciasUsuario.count >= 2) {
      textoAdvertencias += `> ⚠️ *¡Próxima advertencia = Expulsión!* ⚠️\n`
    }
    

    const usuariosMencionados = [quien, ...advertenciasUsuario.warnings.map(w => w.admin)]
    
    return conn.sendMessage(m.chat, {
      text: textoAdvertencias,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: usuariosMencionados
      }
    }, { quoted: m })
  }


  const todasLasAdvertencias = global.db.data.warnings[m.chat]
  const usuariosConAdvertencias = Object.keys(todasLasAdvertencias).filter(usuario => todasLasAdvertencias[usuario].count > 0)

  if (usuariosConAdvertencias.length === 0) {
    return conn.sendMessage(m.chat, {
      text: `🌴 𝗔𝗱𝘃𝗲𝗿𝘁𝗲𝗻𝗰𝗶𝗮𝘀 𝗱𝗲𝗹 𝗚𝗿𝘂𝗽𝗼\n\n> *Grupo:* ${nombreGrupo}\n> *Usuarios con advertencias:* 0`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }

  let textoAdvertenciasGrupo = `🌴 𝗔𝗱𝘃𝗲𝗿𝘁𝗲𝗻𝗰𝗶𝗮𝘀 𝗱𝗲𝗹 𝗚𝗿𝘂𝗽𝗼\n\n> *Grupo:* ${nombreGrupo}\n> *Usuarios con advertencias:* ${usuariosConAdvertencias.length}`

  const usuariosMencionados = []
  
  for (let i = 0; i < usuariosConAdvertencias.length; i++) {
    const idUsuario = usuariosConAdvertencias[i]
    const advertenciasUsuario = todasLasAdvertencias[idUsuario]
    const nombreUsuario = idUsuario.split('@')[0]
    
    usuariosMencionados.push(idUsuario)
    
    textoAdvertenciasGrupo += `> *${i + 1}.* @${nombreUsuario}\n`
    textoAdvertenciasGrupo += `> *Advertencias:* ${advertenciasUsuario.count}/3 ${advertenciasUsuario.count >= 2 ? '⚠️' : '📋'}\n`
    
    if (i < usuariosConAdvertencias.length - 1) {
      textoAdvertenciasGrupo += `│\n`
    }
  }
  
  textoAdvertenciasGrupo += `\n\n> *Comando:* ${usedPrefix}warnings @usuario\n> *Si deseas ver de un usuario.`

  return conn.sendMessage(m.chat, {
    text: textoAdvertenciasGrupo,
    contextInfo: {
      ...rcanal.contextInfo,
      mentionedJid: usuariosMencionados
    }
  }, { quoted: m })
}

handler.command = ['warnings', 'advertencias', 'veradvertencias', 'listwarns']
handler.group = true
handler.admin = true

export default handler
