import { isModeActive, setModeState, ensureModeMap } from '../lib/Modos/modo-utils.js'
import {
  obtenerCfgModoCustom,
  guardarCfgModoCustom
} from '../lib/Modos/modo-custom.js'

function parsearModoCustom(text = '') {
  const crudo = String(text || '').trim()
  if (!crudo) return null

  const idx = crudo.indexOf('|')
  if (idx === -1) return null

  const name = crudo.slice(0, idx).trim()
  const prompt = crudo.slice(idx + 1).trim()
  if (!name || !prompt) return null
  if (name.length > 40) return { error: 'nombre_largo' }
  if (prompt.length < 8) return { error: 'prompt_corto' }
  if (prompt.length > 1500) return { error: 'prompt_largo' }

  return { name, prompt }
}

let handler = async (m, { conn, args, text, usedPrefix, command, isAdmin }) => {
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

    ensureModeMap('modoCustom')
    if (!global.db.data.modoCustomCfg || typeof global.db.data.modoCustomCfg !== 'object') {
      global.db.data.modoCustomCfg = {}
    }

    const accion = args[0]?.toLowerCase()
    const cfgActual = obtenerCfgModoCustom(m.chat)

    const avisarModoActivo = (nombre, comando) => {
      return conn.sendMessage(m.chat, {
        text: `❄ 𝗬𝗔 𝗛𝗔𝗬 𝗨𝗡 𝗠𝗢𝗗𝗢 𝗨𝗦𝗔𝗗𝗢, 𝗣𝗢𝗥 𝗙𝗔𝗩𝗢𝗥 𝗗𝗘𝗦𝗔𝗖𝗧𝗜𝗩𝗔𝗟𝗢\n\n> *Modo activo:* ${nombre}\n> Desactívalo con: ${usedPrefix}${comando} off`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
    }

    if (accion === 'off') {
      setModeState('modoCustom', m.chat, false)
      await global.db.write()

      try {
        const { clearCustomMemory } = await import('../lib/geminiAPI.js')
        clearCustomMemory(m.chat)
      } catch (error) {
        console.error('Error limpiando memoria custom:', error)
      }

      return conn.sendMessage(m.chat, {
        text: `*Modo personalizado desactivado*\n\n> Ya no responde con el personaje del grupo.\n> *Por:* @${m.sender.split('@')[0]}`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
    }

    if (accion === 'clear' || accion === 'limpiar') {
      try {
        const { clearCustomMemory } = await import('../lib/geminiAPI.js')
        clearCustomMemory(m.chat)
        return conn.sendMessage(m.chat, {
          text: `🕳️ *Memoria del modo personalizado limpiada*\n> *Por:* @${m.sender.split('@')[0]}`,
          contextInfo: {
            ...rcanal.contextInfo,
            mentionedJid: [m.sender]
          }
        }, { quoted: m })
      } catch {
        return conn.sendMessage(m.chat, {
          text: '[❌] Error al limpiar la memoria.',
          contextInfo: { ...rcanal.contextInfo }
        }, { quoted: m })
      }
    }

    if (accion === 'ver' || accion === 'info' || accion === 'status') {
      const activo = isModeActive('modoCustom', m.chat)
      if (!cfgActual) {
        return conn.sendMessage(m.chat, {
          text: `[❗] No hay modo personalizado configurado.\n\nUso:\n> ${usedPrefix + command} nombre|prompt\n> ${usedPrefix + command} off`,
          contextInfo: { ...rcanal.contextInfo }
        }, { quoted: m })
      }
      return conn.sendMessage(m.chat, {
        text:
          `*Modo personalizado*\n\n` +
          `> *Estado:* ${activo ? 'activado' : 'desactivado'}\n` +
          `> *Nombre:* ${cfgActual.name}\n` +
          `> *Prompt:* ${cfgActual.prompt.slice(0, 280)}${cfgActual.prompt.length > 280 ? '…' : ''}`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    // Activar / actualizar: /modo peruano|habla con jerga peruana...
    const parseado = parsearModoCustom(text)
    if (parseado?.error === 'nombre_largo') {
      return conn.sendMessage(m.chat, {
        text: '[❗] El nombre del modo es muy largo (máx. 40).',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }
    if (parseado?.error === 'prompt_corto') {
      return conn.sendMessage(m.chat, {
        text: '[❗] El prompt es muy corto. Describe mejor cómo debe comportarse.',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }
    if (parseado?.error === 'prompt_largo') {
      return conn.sendMessage(m.chat, {
        text: '[❗] El prompt es muy largo (máx. 1500 caracteres).',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    if (parseado?.name && parseado?.prompt) {
      if (isModeActive('modoIA', m.chat)) return avisarModoActivo('𝗠𝗼𝗱𝗼 𝗜𝗔', 'modoia')
      if (isModeActive('modoHot', m.chat)) return avisarModoActivo('𝗠𝗼𝗱𝗼 𝗛𝗼𝘁', 'modohot')
      if (isModeActive('modoIlegal', m.chat)) return avisarModoActivo('𝗠𝗼𝗱𝗼 𝗶𝗹𝗲𝗴𝗮𝗹', 'modoilegal')
      if (isModeActive('modoHuman', m.chat)) return avisarModoActivo('𝗠𝗼𝗱𝗼 𝗛𝘂𝗺𝗮𝗻𝗼', 'modohuman')
      if (isModeActive('modoSad', m.chat)) return avisarModoActivo('𝗠𝗼𝗱𝗼 𝗦𝗮𝗱', 'modosad')
      if (isModeActive('modoPsico', m.chat)) return avisarModoActivo('𝗠𝗼𝗱𝗼 𝗣𝘀𝗶𝗰𝗼', 'modospico')

      guardarCfgModoCustom(m.chat, {
        name: parseado.name,
        prompt: parseado.prompt,
        by: m.sender
      })
      setModeState('modoCustom', m.chat, true)
      await global.db.write()

      try {
        const { clearCustomMemory } = await import('../lib/geminiAPI.js')
        clearCustomMemory(m.chat)
      } catch {}

      return conn.sendMessage(m.chat, {
        text:
          `*Modo personalizado activado*\n\n` +
          `> *Nombre:* ${parseado.name}\n` +
          `> Misma lógica que humano: puede ignorar, reaccionar o responder.\n` +
          `> *Prompt:* ${parseado.prompt.slice(0, 220)}${parseado.prompt.length > 220 ? '…' : ''}\n` +
          `> *Por:* @${m.sender.split('@')[0]}\n\n` +
          `Desactivar: ${usedPrefix + command} off`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
    }

    const activo = isModeActive('modoCustom', m.chat)
    return conn.sendMessage(m.chat, {
      text:
        `*[❗] Modo personalizado*\n\n` +
        `*Activar:*\n` +
        `> ${usedPrefix + command} nombre|prompt\n` +
        `> Ejemplo: ${usedPrefix + command} peruano|habla como peruano, usa jerga (causa, pe, oe), tono cercano\n\n` +
        `*Otros:*\n` +
        `> ${usedPrefix + command} off\n` +
        `> ${usedPrefix + command} ver\n` +
        `> ${usedPrefix + command} clear\n\n` +
        `> *Estado:* ${activo ? 'activado' : 'desactivado'}` +
        (cfgActual ? `\n> *Actual:* ${cfgActual.name}` : ''),
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (error) {
    console.error('Error en modo custom:', error)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error al configurar el modo personalizado.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.command = ['modo', 'modocustom', 'modopersonalizado', 'custommode']
handler.help = ['#modo nombre|prompt → modo personalizado (lógica human)']
handler.tags = ['grupo', 'modos']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler
