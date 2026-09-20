/**
 * Modo Custom
 * Misma mecánica que Modo Humano (ignorar / reaccionar / responder),
 * con nombre + prompt personalizado por grupo.
 */

import {
  estaModoActivo,
  normalizarIdChat,
  crearPuertaChat,
  esMensajeTextoPlano,
  asegurarMapaModo
} from './modo-utils.js'
import {
  detectarAccionDesdeTexto,
  esAdminOOwnerGrupo,
  botEsAdminGrupo,
  ejecutarAccionModoCustom,
  mensajeErrorAccion
} from './modo-custom-acciones.js'

const retraso = (ms) => new Promise(resolve => setTimeout(resolve, ms))
const puertaCustom = crearPuertaChat({ label: 'Modo Custom' })

export function obtenerCfgModoCustom(chatId) {
  const gid = normalizarIdChat(chatId)
  const mapa = global.db.data?.modoCustomCfg
  if (!mapa || typeof mapa !== 'object') return null
  const cfg = mapa[gid] || mapa[chatId]
  if (!cfg || typeof cfg !== 'object') return null
  if (!cfg.name || !cfg.prompt) return null
  return {
    ...cfg,
    actions: Array.isArray(cfg.actions) ? cfg.actions : []
  }
}

export function guardarCfgModoCustom(chatId, { name, prompt, actions = [], by = '' } = {}) {
  if (!global.db.data.modoCustomCfg || typeof global.db.data.modoCustomCfg !== 'object') {
    global.db.data.modoCustomCfg = {}
  }
  const gid = normalizarIdChat(chatId)
  global.db.data.modoCustomCfg[gid] = {
    name: String(name || 'Custom').slice(0, 40),
    prompt: String(prompt || '').slice(0, 1500),
    actions: Array.isArray(actions) ? actions : [],
    by: String(by || ''),
    updatedAt: Date.now()
  }
  return global.db.data.modoCustomCfg[gid]
}

export function borrarCfgModoCustom(chatId) {
  const gid = normalizarIdChat(chatId)
  if (global.db.data?.modoCustomCfg?.[gid]) delete global.db.data.modoCustomCfg[gid]
  if (chatId && global.db.data?.modoCustomCfg?.[chatId]) delete global.db.data.modoCustomCfg[chatId]
}

async function simularEscrituraCustom(conn, chat, mensaje = '', estaObsoleto) {
  const ms = Math.min(1200, Math.max(350, 280 + String(mensaje).length * 18 + Math.floor(Math.random() * 220)))

  await conn.sendPresenceUpdate('composing', chat).catch(() => {})

  let restante = ms
  while (restante > 0) {
    if (typeof estaObsoleto === 'function' && estaObsoleto()) {
      await conn.sendPresenceUpdate('paused', chat).catch(() => {})
      return false
    }
    const espera = Math.min(500, restante)
    await retraso(espera)
    restante -= espera
    if (restante > 0) {
      await conn.sendPresenceUpdate('composing', chat).catch(() => {})
    }
  }

  await conn.sendPresenceUpdate('paused', chat).catch(() => {})
  return true
}

export function estaModoCustomActivo(chatId) {
  return estaModoActivo('modoCustom', chatId)
}

export async function manejarModoCustom(m, conn) {
  if (!m.isGroup || !estaModoCustomActivo(m.chat) || m.fromMe) return false
  if (!esMensajeTextoPlano(m)) return false
  if (
    estaModoActivo('modoIA', m.chat) ||
    estaModoActivo('modoHot', m.chat) ||
    estaModoActivo('modoIlegal', m.chat) ||
    estaModoActivo('modoHuman', m.chat) ||
    estaModoActivo('modoSad', m.chat) ||
    estaModoActivo('modoPsico', m.chat)
  ) {
    return false
  }

  const cfg = obtenerCfgModoCustom(m.chat)
  if (!cfg?.prompt) return false

  const texto = m.text.trim()

  return puertaCustom.schedule(
    normalizarIdChat(m.chat),
    { m, conn, text: texto, cfg },
    (trabajo) => ejecutarModoCustom(trabajo)
  )
}

async function ejecutarModoCustom(trabajo) {
  const m = trabajo.m
  const conn = trabajo.conn
  const texto = trabajo.text
  const cfg = trabajo.cfg || obtenerCfgModoCustom(m.chat)
  const estaObsoleto = trabajo.isStale || (() => false)

  if (!m || !conn || !estaModoCustomActivo(m.chat) || !cfg?.prompt) return false
  if (estaObsoleto()) return false

  try {
    const { callGeminiCustomAPI, isLikelyCommand } = await import('../geminiAPI.js')

    const ultimoTexto = trabajo.last?.text || ''
    if (isLikelyCommand(ultimoTexto)) return false
    if (/^[\s\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]*$/u.test(ultimoTexto)) {
      return false
    }

    if (estaObsoleto()) return false

    const rcanal = global.rcanal || {
      contextInfo: {
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: '',
          serverMessageId: 100,
          newsletterName: ''
        }
      }
    }

    const metadatos =
      (conn.chats[m.chat] || {}).metadata ||
      (await conn.groupMetadata(m.chat).catch(() => null)) ||
      {}
    const participants = metadatos.participants || []

    const esAdminRequester = await esAdminOOwnerGrupo(m, conn, participants)
    const acciones = Array.isArray(cfg.actions) ? cfg.actions : []
    const puedeModerar = esAdminRequester && acciones.length > 0

    const tieneObjetivo =
      Boolean(m.quoted) ||
      Boolean(m.mentionedJid?.length) ||
      Boolean(m.msg?.contextInfo?.mentionedJid?.length)

    let accionHeuristica = null
    if (puedeModerar) {
      accionHeuristica = detectarAccionDesdeTexto(texto, acciones)
      // del requiere responder un mensaje
      if (accionHeuristica === 'del' && !m.quoted) accionHeuristica = null
      // ban/mute/warn/unmute necesitan mención o respuesta
      if (accionHeuristica && accionHeuristica !== 'del' && !tieneObjetivo) {
        accionHeuristica = null
      }
    }

    const nombreUsuario = m.pushName || m.name || 'Usuario'
    const nombreGrupo = await conn.getName(m.chat) || metadatos.subject || 'Grupo'

    const decision = await callGeminiCustomAPI(
      texto,
      nombreUsuario,
      nombreGrupo,
      m.chat,
      {
        name: cfg.name,
        prompt: cfg.prompt,
        actions: acciones,
        isAdminRequester: puedeModerar,
        hasTarget: tieneObjetivo,
        hasQuoted: Boolean(m.quoted)
      }
    )

    if (estaObsoleto()) return false

    
    let adminAction = null
    if (puedeModerar) {
      const desdeIa = decision?.adminAction || null
      adminAction = accionHeuristica || (acciones.includes(desdeIa) ? desdeIa : null)
    }

    if (adminAction) {
      const botAdmin = await botEsAdminGrupo(conn, participants)
      if (!botAdmin && (adminAction === 'ban' || adminAction === 'del' || adminAction === 'warn')) {
        await conn.sendMessage(m.chat, {
          text: decision?.message || 'No puedo: necesito ser admin del grupo.',
          contextInfo: { ...rcanal.contextInfo }
        }, { quoted: m }).catch(() => {})
        return true
      }

      const resultado = await ejecutarAccionModoCustom({
        accion: adminAction,
        m,
        conn,
        participants,
        motivo: decision?.motivo || 'Pedido de admin'
      })

      if (estaObsoleto()) return false

      if (!resultado.ok) {
        const aviso = mensajeErrorAccion(resultado.detail)
        const textoFallido = decision?.message
          ? `${decision.message}\n\n> ${aviso}`
          : aviso
        await conn.sendMessage(m.chat, {
          text: textoFallido,
          contextInfo: { ...rcanal.contextInfo }
        }, { quoted: m }).catch(() => {})
        return true
      }

      
      let mensajeOk = decision?.message || ''
      if (!mensajeOk) {
        if (adminAction === 'ban') mensajeOk = 'listo, fuera.'
        else if (adminAction === 'del') mensajeOk = 'borrado.'
        else if (adminAction === 'mute') mensajeOk = 'muteado.'
        else if (adminAction === 'unmute') mensajeOk = 'ya puede hablar.'
        else if (adminAction === 'delwarn') mensajeOk = 'warns limpiados.'
        else if (adminAction === 'warn') {
          mensajeOk = resultado.detail === 'warn_expulsado'
            ? '3 warns, fuera.'
            : `warn ${resultado.count || ''}/3`.trim()
        }
      }

      const mentions = [resultado.quien, m.sender].filter(Boolean)
      const ok = await simularEscrituraCustom(conn, m.chat, mensajeOk, estaObsoleto)
      if (!ok || estaObsoleto()) return false

      await conn.sendMessage(m.chat, {
        text: mensajeOk,
        contextInfo: {
          ...rcanal.contextInfo,
          ...(mentions.length ? { mentionedJid: mentions } : {})
        }
      }, { quoted: m })

      return true
    }

    if (!decision || decision.action === 'ignore') return false

    if (decision.action === 'react' && decision.emoji) {
      await retraso(180 + Math.floor(Math.random() * 320))
      if (estaObsoleto()) return false
      await conn.sendMessage(m.chat, {
        react: { text: decision.emoji, key: m.key }
      }).catch(() => {})
      return true
    }

    if (decision.action === 'reply' && decision.message) {
      const ok = await simularEscrituraCustom(conn, m.chat, decision.message, estaObsoleto)
      if (!ok || estaObsoleto()) return false

      await conn.sendMessage(m.chat, {
        text: decision.message,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })

      return true
    }

    return false
  } catch (error) {
    console.error('Error en Modo Custom:', error)
    return false
  }
}

export {
  estaModoCustomActivo as isModoCustomActive,
  manejarModoCustom as handleModoCustom,
  obtenerCfgModoCustom as getCustomModeConfig,
  guardarCfgModoCustom as setCustomModeConfig,
  asegurarMapaModo
}
