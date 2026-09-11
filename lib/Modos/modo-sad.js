/**
 * Modo Sad
 * Misma mecánica que Modo Humano: ignorar, reaccionar o responder corto.
 * Actitud: hombre triste / psicólogo oscuro.
 */

import { estaModoActivo, normalizarIdChat, crearPuertaChat, esMensajeTextoPlano } from './modo-utils.js'

const retraso = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const puertaSad = crearPuertaChat({ label: 'Modo Sad' })

async function simularEscrituraSad(conn, chat, mensaje = '', estaObsoleto) {
  const ms = Math.min(3000, Math.max(1200, 1100 + String(mensaje).length * 40 + Math.floor(Math.random() * 500)))

  await conn.sendPresenceUpdate('composing', chat).catch(() => {})

  let restante = ms
  while (restante > 0) {
    if (typeof estaObsoleto === 'function' && estaObsoleto()) {
      await conn.sendPresenceUpdate('paused', chat).catch(() => {})
      return false
    }
    const espera = Math.min(1200, restante)
    await retraso(espera)
    restante -= espera
    if (restante > 0) {
      await conn.sendPresenceUpdate('composing', chat).catch(() => {})
    }
  }

  await conn.sendPresenceUpdate('paused', chat).catch(() => {})
  return true
}

export function estaModoSadActivo(chatId) {
  return estaModoActivo('modoSad', chatId)
}

export async function manejarModoSad(m, conn) {
  if (!m.isGroup || !estaModoSadActivo(m.chat) || m.fromMe) return false
  if (!esMensajeTextoPlano(m)) return false
  if (
    estaModoActivo('modoIA', m.chat) ||
    estaModoActivo('modoHot', m.chat) ||
    estaModoActivo('modoIlegal', m.chat) ||
    estaModoActivo('modoHuman', m.chat) ||
    estaModoActivo('modoPsico', m.chat)
  ) {
    return false
  }

  const texto = m.text.trim()

  return puertaSad.schedule(
    normalizarIdChat(m.chat),
    { m, conn, text: texto },
    (trabajo) => ejecutarModoSad(trabajo)
  )
}

async function ejecutarModoSad(trabajo) {
  const m = trabajo.m
  const conn = trabajo.conn
  const texto = trabajo.text
  const estaObsoleto = trabajo.isStale || (() => false)
  if (!m || !conn || !estaModoSadActivo(m.chat)) return false
  if (estaObsoleto()) return false

  try {
    const { callGeminiSadAPI, isLikelyCommand } = await import('../geminiAPI.js')

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

    const nombreUsuario = m.pushName || m.name || 'Usuario'
    const nombreGrupo = await conn.getName(m.chat) || 'Grupo'

    const decision = await callGeminiSadAPI(texto, nombreUsuario, nombreGrupo, m.chat)

    if (estaObsoleto()) return false
    if (!decision || decision.action === 'ignore') return false

    if (decision.action === 'react' && decision.emoji) {
      await retraso(700 + Math.floor(Math.random() * 1100))
      if (estaObsoleto()) return false
      await conn.sendMessage(m.chat, {
        react: { text: decision.emoji, key: m.key }
      }).catch(() => {})
      return true
    }

    if (decision.action === 'reply' && decision.message) {
      const ok = await simularEscrituraSad(conn, m.chat, decision.message, estaObsoleto)
      if (!ok || estaObsoleto()) return false

      await conn.sendMessage(m.chat, {
        text: decision.message,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })

      return true
    }

    return false
  } catch (error) {
    console.error('Error en Modo Sad:', error)
    return false
  }
}

export {
  estaModoSadActivo as isModoSadActive,
  manejarModoSad as handleModoSad
}
