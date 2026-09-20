import { isModeActive, setModeState, ensureModeMap } from '../lib/Modos/modo-utils.js'
import {
  obtenerCfgModoCustom,
  guardarCfgModoCustom
} from '../lib/Modos/modo-custom.js'
import {
  normalizarListaAcciones,
  etiquetaAcciones,
  ACCIONES_VALIDAS
} from '../lib/Modos/modo-custom-acciones.js'

function parsearModoCustom(text = '') {
  const crudo = String(text || '').trim()
  if (!crudo) return null

  // nombre|prompt|acciones(opcional)
  const campos = []
  let buf = crudo
  while (campos.length < 2) {
    const i = buf.indexOf('|')
    if (i === -1) {
      campos.push(buf.trim())
      buf = ''
      break
    }
    campos.push(buf.slice(0, i).trim())
    buf = buf.slice(i + 1)
  }
  if (buf) campos.push(buf.trim())

  const name = campos[0] || ''
  const prompt = campos[1] || ''
  const actionsRaw = campos[2] || ''

  if (!name || !prompt) return null
  if (name.length > 40) return { error: 'nombre_largo' }
  if (prompt.length < 8) return { error: 'prompt_corto' }
  if (prompt.length > 1500) return { error: 'prompt_largo' }

  const actions = normalizarListaAcciones(actionsRaw)
  if (actionsRaw && !actions.length) return { error: 'acciones_invalidas' }

  return { name, prompt, actions }
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
          text: `[❗] No hay modo personalizado configurado.\n\nUso:\n> ${usedPrefix + command} nombre|prompt\n> ${usedPrefix + command} nombre|prompt|all\n> ${usedPrefix + command} nombre|prompt|ban,del,mute,unmute,warn,delwarn\n> ${usedPrefix + command} off`,
          contextInfo: { ...rcanal.contextInfo }
        }, { quoted: m })
      }
      return conn.sendMessage(m.chat, {
        text:
          `*Modo personalizado*\n\n` +
          `> *Estado:* ${activo ? 'activado' : 'desactivado'}\n` +
          `> *Nombre:* ${cfgActual.name}\n` +
          `> *Acciones:* ${etiquetaAcciones(cfgActual.actions)}\n` +
          `> *Prompt:* ${cfgActual.prompt.slice(0, 280)}${cfgActual.prompt.length > 280 ? '…' : ''}`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

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
    if (parseado?.error === 'acciones_invalidas') {
      return conn.sendMessage(m.chat, {
        text: `[❗] Acciones no válidas.\n\nPermitidas: ${ACCIONES_VALIDAS.join(', ')} o *all*\nEjemplo: ban,del,mute,unmute,warn,delwarn\nAtajo: all`,
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
        actions: parseado.actions || [],
        by: m.sender
      })
      setModeState('modoCustom', m.chat, true)
      await global.db.write()

      try {
        const { clearCustomMemory } = await import('../lib/geminiAPI.js')
        clearCustomMemory(m.chat)
      } catch {}

      const accionesTxt = parseado.actions?.length
        ? parseado.actions.join(', ')
        : 'ninguna (solo chat)'

      return conn.sendMessage(m.chat, {
        text:
          `*Modo personalizado activado*\n\n` +
          `> *Nombre:* ${parseado.name}\n` +
          `> *Acciones:* ${accionesTxt}\n` +
          `> Lógica human: ignora / reacciona / responde.\n` +
          (parseado.actions?.length
            ? `> Si un *admin* pide ban/mute/warn/del (mencionando o respondiendo), el modo lo ejecuta y responde con su personaje.\n`
            : '') +
          `> *Prompt:* ${parseado.prompt.slice(0, 200)}${parseado.prompt.length > 200 ? '…' : ''}\n` +
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
        `*Formato:*\n` +
        `> ${usedPrefix + command} nombre|prompt\n` +
        `> ${usedPrefix + command} nombre|prompt|acciones\n\n` +
        `*Ejemplo chat:*\n` +
        `> ${usedPrefix + command} peruano|habla como peruano, jerga causa/pe\n\n` +
        `*Ejemplo asistente admin:*\n` +
        `> ${usedPrefix + command} asistente|humor seco y directo|ban,del,mute,unmute,warn,delwarn\n` +
        `> ${usedPrefix + command} asistente|humor seco|all\n\n` +
        `*Acciones:* ${ACCIONES_VALIDAS.join(', ')}\n` +
        `> Atajo: *all* (activa todas)\n` +
        `> Solo un *admin* puede activarlas hablando (responder o mencionar al objetivo).\n\n` +
        `*Otros:* ${usedPrefix + command} off | ver | clear\n\n` +
        `> *Estado:* ${activo ? 'activado' : 'desactivado'}` +
        (cfgActual ? `\n> *Actual:* ${cfgActual.name} (${etiquetaAcciones(cfgActual.actions)})` : ''),
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
handler.help = ['#modo nombre|prompt|all']
handler.tags = ['grupo', 'modos']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler
