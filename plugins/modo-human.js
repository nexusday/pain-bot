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
    ensureModeMap('modoHuman')

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
      if (isModeActive('modoSad', m.chat)) return avisarModoActivo('𝗠𝗼𝗱𝗼 𝗦𝗮𝗱', 'modosad')
      if (isModeActive('modoPsico', m.chat)) return avisarModoActivo('𝗠𝗼𝗱𝗼 𝗣𝘀𝗶𝗰𝗼', 'modospico')

      setModeState('modoHuman', m.chat, true)
      await global.db.write()

      return conn.sendMessage(m.chat, {
        text: `*Modo Humano activado*

> Alguien más está en el chat… o eso parece..?
> Puede ignorar, reaccionar con emoji o responder.
> *Por:* @${m.sender.split('@')[0]}`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
    }

    if (accion === 'off') {
      setModeState('modoHuman', m.chat, false)
      await global.db.write()

      try {
        const { clearHumanMemory } = await import('../lib/geminiAPI.js')
        clearHumanMemory(m.chat)
      } catch (error) {
        console.error('Error limpiando memoria humano:', error)
      }

      return conn.sendMessage(m.chat, {
        text: `*Modo Humano desactivado*\n\n> Ya no hay presencia del bot en el grupo.\n> *Por:* @${m.sender.split('@')[0]}`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
    }

    if (accion === 'clear' || accion === 'limpiar') {
      try {
        const { clearHumanMemory } = await import('../lib/geminiAPI.js')
        clearHumanMemory(m.chat)

        return conn.sendMessage(m.chat, {
          text: `🕳️ *Memoria del Modo Humano limpiada*\n> *Por:* @${m.sender.split('@')[0]}`,
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

    const estado = isModeActive('modoHuman', m.chat) ? 'activado' : 'desactivado'

    return conn.sendMessage(m.chat, {
      text: `[❗] Uso: ${usedPrefix + command} on/off/clear\n\n> *Estado:* ${estado}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (error) {
    console.error('Error en modohuman:', error)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error al configurar el modo humano.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.command = ['modohuman', 'humanmode', 'modoh', 'humandigital']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler
