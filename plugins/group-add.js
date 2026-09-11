let handler = async (m, { conn, args, participants, isAdmin, isBotAdmin, isOwner, isPrems, usedPrefix, command }) => {
  if (!m.isGroup) return conn.sendMessage(m.chat, {
    text: '[❗] Este comando solo puede ser usado en grupos.',
    contextInfo: {
      ...rcanal.contextInfo
    }
  }, { quoted: m })
  
  
  if (!args[0]) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Debes poner un número de teléfono.\n\n> Ejemplo: ${usedPrefix + command} 51999999999`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
  
  
  let numero = args.join(' ')
  
  
  numero = numero.replace(/[\s\-\(\)\.]/g, '')
  
  
  if (numero.startsWith('+')) {
    numero = numero.substring(1)
  }
  
  
  if (numero.includes('@s.whatsapp.net')) {
    numero = numero.replace('@s.whatsapp.net', '')
  }
  
  
  if (!/^\d+$/.test(numero)) {
    return conn.sendMessage(m.chat, {
      text: '[❗] El número de teléfono contiene caracteres inválidos. Solo se permiten números.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
  
  
  if (numero.length < 10 || numero.length > 15) {
    return conn.sendMessage(m.chat, {
      text: '[❗] Número de teléfono inválido. Debe tener entre 10 y 15 dígitos.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
  
  
  if (!numero.startsWith('1') && !numero.startsWith('2') && !numero.startsWith('3') && !numero.startsWith('4') && !numero.startsWith('5') && !numero.startsWith('6') && !numero.startsWith('7') && !numero.startsWith('8') && !numero.startsWith('9')) {
    numero = '1' + numero 
  }
  
  
  if (numero.startsWith('52') && numero.length >= 12) {
    
    if (numero.charAt(2) !== '1') {
      numero = '52' + '1' + numero.substring(2)
    }
  }
  
  
  const jidUsuario = numero + '@s.whatsapp.net'
  
  
  const metadatosGrupo = await conn.groupMetadata(m.chat)
  const usuarioEnGrupo = metadatosGrupo.participants.find(p => p.id === jidUsuario)
  
  if (usuarioEnGrupo) {
    return conn.sendMessage(m.chat, {
      text: `[❗] El usuario ${numero} ya está en este grupo.`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
  
  
  if (jidUsuario === conn.user.jid) {
    return conn.sendMessage(m.chat, {
      text: '[❗] No puedes agregar al bot al grupo.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
  
  try {
    
    await conn.groupParticipantsUpdate(m.chat, [jidUsuario], 'add')
    
    const nombreGrupo = metadatosGrupo.subject
    
    return conn.sendMessage(m.chat, {
      text: `🌴 𝗨𝘀𝘂𝗮𝗿𝗶𝗼 𝗮𝗴𝗿𝗲𝗴𝗮𝗱𝗼 𝗰𝗼𝗿𝗿𝗲𝗰𝘁𝗮𝗺𝗲𝗻𝘁𝗲.\n\n> 🜸 Número: ${numero}\n> ✰ Admin: @${m.sender.split('@')[0]}\n> ❂ Grupo: ${nombreGrupo}`,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender]
      }
    }, { quoted: m })
    
  } catch (error) {
    console.error('Error agregando usuario:', error)
    
    
    if (error.message && error.message.includes('not-authorized')) {
      return conn.sendMessage(m.chat, {
        text: `[❗] No se pudo agregar al usuario ${numero}.\n\n> ❌ *Razón:* El usuario tiene deshabilitada la opción de "Agregar a grupos" en su configuración de privacidad.`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    
    if (error.message && error.message.includes('forbidden')) {
      return conn.sendMessage(m.chat, {
        text: `[❗] No se pudo agregar al usuario ${numero}.\n\n> ❌ *Razón:* El bot no tiene permisos suficientes o el grupo está restringido.`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    
    if (error.message && error.message.includes('not-found')) {
      return conn.sendMessage(m.chat, {
        text: `[❗] No se pudo agregar al usuario ${numero}.\n\n> El número no existe en whatsapp.`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    
    if (error.message && error.message.includes('bad-request')) {
      return conn.sendMessage(m.chat, {
        text: `[❗] No se pudo agregar al usuario ${numero}.\n\n> Numero incorrecto.`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
    
   
    return conn.sendMessage(m.chat, {
      text: `[❌] Ocurrió un error al intentar agregar al usuario ${numero}.\n\n> *Error:* ${error.message || 'Error desconocido'}`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

//handler.command = ['adg', 'addgroup', 'addgp']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler 