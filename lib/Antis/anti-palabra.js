/**
 * Sistema Anti-Palabra
 * Detecta palabras prohibidas configuradas por grupo y aplica acción.
 */

import {
  buscarConnBotAdmin,
  obtenerBanderasAdminParticipante,
} from '../group-participant.js'

function plegarMathAlpha(str) {
  return String(str || '')
    .replace(/[\u{1D400}-\u{1D419}]/gu, c => String.fromCharCode(c.codePointAt(0) - 0x1D400 + 65))
    .replace(/[\u{1D41A}-\u{1D433}]/gu, c => String.fromCharCode(c.codePointAt(0) - 0x1D41A + 97))
    .replace(/[\u{1D5D4}-\u{1D5ED}]/gu, c => String.fromCharCode(c.codePointAt(0) - 0x1D5D4 + 65))
    .replace(/[\u{1D5EE}-\u{1D607}]/gu, c => String.fromCharCode(c.codePointAt(0) - 0x1D5EE + 97))
    .replace(/[\u{1D7EC}-\u{1D7F5}]/gu, c => String.fromCharCode(c.codePointAt(0) - 0x1D7EC + 48))
    .replace(/[\u{FF10}-\u{FF19}]/gu, c => String.fromCharCode(c.codePointAt(0) - 0xFF10 + 48))
    .replace(/[\u{FF21}-\u{FF3A}]/gu, c => String.fromCharCode(c.codePointAt(0) - 0xFF21 + 65))
    .replace(/[\u{FF41}-\u{FF5A}]/gu, c => String.fromCharCode(c.codePointAt(0) - 0xFF41 + 97))
}

export function normalizarTextoAnti(text) {
  return plegarMathAlpha(text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñáéíóúü\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function sanitizarPalabrasAntiPalabra(words) {
  if (!Array.isArray(words)) return []
  const vistos = new Set()
  const salida = []
  for (const crudo of words) {
    let n = normalizarTextoAnti(crudo)
    if (n.startsWith('add ') && n.includes(' ')) n = n.slice(4).trim()
    if (!n || vistos.has(n)) continue
    vistos.add(n)
    salida.push(n)
  }
  return salida
}

export function asegurarStoreAntiPalabra() {
  if (!global.db) global.db = { data: {} }
  if (!global.db.data) global.db.data = {}
  if (!global.db.data.antiPalabra || typeof global.db.data.antiPalabra !== 'object') {
    global.db.data.antiPalabra = {}
  }
  return global.db.data.antiPalabra
}

export function obtenerConfigAntiPalabra(chat) {
  const store = asegurarStoreAntiPalabra()
  if (!chat || !store[chat]) return null
  const cfg = store[chat]
  const limpio = sanitizarPalabrasAntiPalabra(cfg.words)
  if (JSON.stringify(limpio) !== JSON.stringify(cfg.words || [])) {
    cfg.words = limpio
    global.db.write?.().catch(() => {})
  }
  return cfg
}

function obtenerTextoInspeccionable(m) {
  const partes = [
    m?.text,
    m?.msg?.text,
    m?.msg?.caption,
    m?.msg?.contentText,
    m?.msg?.conversation,
  ]
  return partes
    .filter(v => typeof v === 'string' && v.trim())
    .join(' ')
}

function mensajeContienePalabraProhibida(text, word) {
  const hay = normalizarTextoAnti(text)
  const aguja = normalizarTextoAnti(word)
  if (!aguja || !hay) return false
  if (hay.includes(aguja)) return true

  if (aguja.includes(' ')) {
    const partes = aguja.split(' ').filter(Boolean)
    if (partes.length > 1) {
      let pos = 0
      for (const parte of partes) {
        const idx = hay.indexOf(parte, pos)
        if (idx === -1) return false
        pos = idx + parte.length
      }
      return true
    }
  }

  return false
}

function esComandoBot(text) {
  const escaparRegex = str => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
  const prefijos = Array.isArray(global.prefix) ? global.prefix : [global.prefix]
  return prefijos.some(p => {
    if (p instanceof RegExp) return p.test(text)
    if (typeof p === 'string') return new RegExp(escaparRegex(p)).test(text)
    return false
  })
}

function construirClaveBorrado(m) {
  const key = m.key || {}
  return {
    remoteJid: key.remoteJid || m.chat,
    fromMe: !!key.fromMe,
    id: key.id,
    participant: key.participant || m.participant || m.sender,
  }
}

async function obtenerParticipantesGrupo(conn, m) {
  const enCache = conn?.chats?.[m.chat]?.metadata?.participants
  if (Array.isArray(enCache) && enCache.length) return enCache
  try {
    const meta = await conn.groupMetadata(m.chat)
    return meta?.participants || []
  } catch {
    return []
  }
}

async function borrarConBotAdmin(m, conn, participants) {
  const claveBorrado = construirClaveBorrado(m)
  const connAdmin = buscarConnBotAdmin(participants, conn)

  const aProbar = []
  const vistos = new Set()
  const agregar = (c) => {
    const id = c?.user?.jid || c?.user?.id
    if (!c?.sendMessage || vistos.has(id)) return
    vistos.add(id)
    aProbar.push(c)
  }
  agregar(connAdmin)
  agregar(conn)

  for (const c of aProbar) {
    try {
      await c.sendMessage(m.chat, { delete: claveBorrado })
      return true
    } catch {}
    try {
      await c.sendMessage(m.chat, { delete: m.key })
      return true
    } catch {}
  }
  return false
}

export async function manejarAntiPalabra(m, conn, esAdmin, rcanal, esOwner = false) {
  try {
    if (!m.isGroup || m.fromMe) return

    const cfg = obtenerConfigAntiPalabra(m.chat)
    if (!cfg || !cfg.enabled) return

    const participants = await obtenerParticipantesGrupo(conn, m)
    const { isAdmin: remitenteEsAdmin } = obtenerBanderasAdminParticipante(participants, m, conn)
    if (remitenteEsAdmin || esOwner) return false

    const texto = obtenerTextoInspeccionable(m)
    if (!texto) return
    if (esComandoBot(texto)) return

    const palabras = sanitizarPalabrasAntiPalabra(cfg.words)
    if (palabras.length === 0) return

    const encontrada = palabras.some(word => mensajeContienePalabraProhibida(texto, word))
    if (!encontrada) return

    const accion = cfg.action || 'delete'
    const borrado = await borrarConBotAdmin(m, conn, participants)
    const connAdmin = buscarConnBotAdmin(participants, conn) || conn
    const ctx = { contextInfo: { ...rcanal.contextInfo, mentionedJid: [m.sender] } }

    if (accion === 'kick') {
      if (borrado) {
        await connAdmin.sendMessage(m.chat, {
          text: `@${m.sender.split('@')[0]} usó una palabra prohibida y será expulsado.`,
          ...ctx,
        }).catch(() => {})
      }
      await connAdmin.groupParticipantsUpdate(m.chat, [m.sender], 'remove').catch(() => {})
      if (!borrado) {
        await conn.sendMessage(m.chat, {
          text: `@${m.sender.split('@')[0]} usó una palabra prohibida. El bot debe ser *admin* para borrar mensajes.`,
          ...ctx,
        }).catch(() => {})
      }
    } else if (borrado) {
      await conn.sendMessage(m.chat, {
        text: `@${m.sender.split('@')[0]} mensaje eliminado por palabra prohibida.`,
        ...ctx,
      }).catch(() => {})
    } else {
      await conn.sendMessage(m.chat, {
        text: `@${m.sender.split('@')[0]} usó una palabra prohibida. El bot debe ser *admin* para borrar mensajes.`,
        ...ctx,
      }).catch(() => {})
    }

    return true
  } catch (e) {
    console.error('handleAntiPalabra error:', e)
    return false
  }
}

export {
  normalizarTextoAnti as normalizeAntiText,
  sanitizarPalabrasAntiPalabra as sanitizeAntiPalabraWords,
  asegurarStoreAntiPalabra as ensureAntiPalabraStore,
  obtenerConfigAntiPalabra as getAntiPalabraConfig,
  manejarAntiPalabra as handleAntiPalabra
}
