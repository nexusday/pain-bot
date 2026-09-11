let handler = async (m, { conn, args, usedPrefix, command, isAdmin, isBotAdmin }) => {
  if (!m.isGroup) return conn.sendMessage(m.chat, {
    text: '[❗] Este comando solo puede ser usado en grupos.',
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })


  const nuevaDesc = args.join(' ').trim()

  if (!nuevaDesc) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Debes indicar la nueva descripción del grupo.\n\n> *Ejemplo:*\n- ${usedPrefix + command} Bienvenidos al grupo de PAIN BOT, esta prohibido los links.`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  try {
    const metadatos = await conn.groupMetadata(m.chat)
    const descAnterior = (metadatos && metadatos.desc) ? metadatos.desc : 'Sin descripción'

    await conn.groupUpdateDescription(m.chat, nuevaDesc)

    return conn.sendMessage(m.chat, {
      text: `🌴 𝗗𝗲𝘀𝗰𝗿𝗶𝗽𝗰𝗶𝗼́𝗻 𝗮𝗰𝘁𝘂𝗮𝗹𝗶𝘇𝗮𝗱𝗮\n> *Antes:* ${descAnterior.substring(0, 300)}${descAnterior.length > 300 ? '…' : ''}\n> *Ahora:* ${nuevaDesc}\n> *Por:* @${m.sender.split('@')[0]}`,
      contextInfo: { ...rcanal.contextInfo, mentionedJid: [m.sender] }
    }, { quoted: m })
  } catch (e) {
    console.error('Error cambiando descripción del grupo:', e)
    return conn.sendMessage(m.chat, {
      text: '[❗] No se pudo cambiar la descripción del grupo. Asegúrate de que el bot sea administrador.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.command = ['desgp']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler
