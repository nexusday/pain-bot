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
    ensureModeMap('modoPsico')

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
      if (isModeActive('modoSad', m.chat)) return avisarModoActivo('𝗠𝗼𝗱𝗼 𝗦𝗮𝗱', 'modosad')

      setModeState('modoPsico', m.chat, true)
      await global.db.write()

      return conn.sendMessage(m.chat, {
        text: `*Modo Psico activado*

> Alguien del chat… con mirada de psicólogo top.
> Puede ignorar, reaccionar según el mensaje o ayudarte de verdad.
> *Por:* @${m.sender.split('@')[0]}`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
    }

    if (accion === 'off') {
      setModeState('modoPsico', m.chat, false)
      await global.db.write()

      try {
        const { clearPsicoMemory } = await import('../lib/geminiAPI.js')
        clearPsicoMemory(m.chat)
      } catch (error) {
        console.error('Error limpiando memoria psico:', error)
      }

      return conn.sendMessage(m.chat, {
        text: `*Modo Psico desactivado*\n\n> Se cerró la sesión del chat.\n> *Por:* @${m.sender.split('@')[0]}`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
    }

    if (accion === 'clear' || accion === 'limpiar') {
      try {
        const { clearPsicoMemory } = await import('../lib/geminiAPI.js')
        clearPsicoMemory(m.chat)

        return conn.sendMessage(m.chat, {
          text: `🕳️ *Memoria del Modo Psico limpiada*\n> *Por:* @${m.sender.split('@')[0]}`,
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

    const estado = isModeActive('modoPsico', m.chat) ? 'activado' : 'desactivado'

    return conn.sendMessage(m.chat, {
      text: `[❗] Uso: ${usedPrefix + command} on/off/clear\n\n> *Estado:* ${estado}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (error) {
    console.error('Error en modospico:', error)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error al configurar el modo psico.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.command = ['modospico', 'modopsico', 'psicomode', 'psicologo', 'modopsicologo']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler
