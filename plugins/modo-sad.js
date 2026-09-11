import { isModeActive, setModeState, ensureModeMap } from '../lib/Modos/modo-utils.js'

let handler = async (m, { conn, args, usedPrefix, command, isAdmin }) => {
  try {
    if (!m.isGroup) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Este comando solo funciona en grupos.',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    if (!isAdmin) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Solo los administradores pueden usar este comando.',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const accion = args[0]?.toLowerCase()
    ensureModeMap('modoSad')

    const avisarModoActivo = (nombre, comando) => {
      return conn.sendMessage(m.chat, {
        text: `❄ 𝗬𝗔 𝗛𝗔𝗬 𝗨𝗡 𝗠𝗢𝗗𝗢 𝗨𝗦𝗔𝗗𝗢, 𝗣𝗢𝗥 𝗙𝗔𝗩𝗢𝗥 𝗗𝗘𝗦𝗔𝗖𝗧𝗜𝗩𝗔𝗟𝗢\n\n> *Modo activo:* ${nombre}\n> Desactívalo con: ${usedPrefix}${comando} off`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
    }

    if (accion === 'on') {
      if (isModeActive('modoIA', m.chat)) return avisarModoActivo('𝗠𝗼𝗱𝗼 𝗜𝗔', 'modoia')
      if (isModeActive('modoHot', m.chat)) return avisarModoActivo('𝗠𝗼𝗱𝗼 𝗛𝗼𝘁', 'modohot')
      if (isModeActive('modoIlegal', m.chat)) return avisarModoActivo('𝗠𝗼𝗱𝗼 𝗶𝗹𝗲𝗴𝗮𝗹', 'modoilegal')
      if (isModeActive('modoHuman', m.chat)) return avisarModoActivo('𝗠𝗼𝗱𝗼 𝗛𝘂𝗺𝗮𝗻𝗼', 'modohuman')
      if (isModeActive('modoPsico', m.chat)) return avisarModoActivo('𝗠𝗼𝗱𝗼 𝗣𝘀𝗶𝗰𝗼', 'modospico')

      setModeState('modoSad', m.chat, true)
      await global.db.write()

      return conn.sendMessage(m.chat, {
        text: `*Modo Sad activado*

> Alguien triste entró al chat… o eso parece.
> Puede ignorar, reaccionar o responder con voz baja.
> *Por:* @${m.sender.split('@')[0]}`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
    }

    if (accion === 'off') {
      setModeState('modoSad', m.chat, false)
      await global.db.write()

      try {
        const { clearSadMemory } = await import('../lib/geminiAPI.js')
        clearSadMemory(m.chat)
      } catch (error) {
        console.error('Error limpiando memoria sad:', error)
      }

      return conn.sendMessage(m.chat, {
        text: `*Modo Sad desactivado*\n\n> Se fue en silencio.\n> *Por:* @${m.sender.split('@')[0]}`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
    }

    if (accion === 'clear' || accion === 'limpiar') {
      try {
        const { clearSadMemory } = await import('../lib/geminiAPI.js')
        clearSadMemory(m.chat)

        return conn.sendMessage(m.chat, {
          text: `🕳️ *Memoria del Modo Sad limpiada*\n> *Por:* @${m.sender.split('@')[0]}`,
          contextInfo: {
            ...rcanal.contextInfo,
            mentionedJid: [m.sender]
          }
        }, { quoted: m })
      } catch (error) {
        return conn.sendMessage(m.chat, {
          text: '[❌] Error al limpiar la memoria.',
          contextInfo: { ...rcanal.contextInfo }
        }, { quoted: m })
      }
    }

    const estado = isModeActive('modoSad', m.chat) ? 'activado' : 'desactivado'

    return conn.sendMessage(m.chat, {
      text: `[❗] Uso: ${usedPrefix + command} on/off/clear\n\n> *Estado:* ${estado}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (error) {
    console.error('Error en modosad:', error)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error al configurar el modo sad.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.command = ['modosad', 'sadmode', 'modos', 'humansad']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler
