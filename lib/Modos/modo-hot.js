/**
 * Modo IA Hot
 * Respuestas automáticas con contenido adulto usando Gemini AI
 */

import { estaModoActivo, normalizarIdChat, crearPuertaChat, esMensajeTextoPlano } from './modo-utils.js'

const retraso = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const puertaHot = crearPuertaChat({ label: 'Modo Hot' })

export async function manejarModoHot(m, conn) {
  if (!m.isGroup || !estaModoActivo('modoHot', m.chat) || m.fromMe) return false
  if (!esMensajeTextoPlano(m)) return false
  if (estaModoActivo('modoHuman', m.chat) || estaModoActivo('modoSad', m.chat) || estaModoActivo('modoPsico', m.chat)) return false
  if (estaModoActivo('modoIA', m.chat) || estaModoActivo('modoIlegal', m.chat)) return false

  const texto = m.text.trim()
  if (texto.length < 4) return false

  return puertaHot.schedule(
    normalizarIdChat(m.chat),
    { m, conn, text: texto },
    (trabajo) => ejecutarModoHot(trabajo)
  )
}

async function ejecutarModoHot(trabajo) {
  const m = trabajo.m
  const conn = trabajo.conn
  const texto = trabajo.text
  const estaObsoleto = trabajo.isStale || (() => false)
  if (!m || !conn || !estaModoActivo('modoHot', m.chat)) return false
  if (estaObsoleto()) return false

  try {
    const { callGeminiHotAPI, isLikelyCommand } = await import('../geminiAPI.js')

    const ultimoTexto = trabajo.last?.text || ''
    if (isLikelyCommand(ultimoTexto)) return false
    if (ultimoTexto.trim().length < 4) return false

    if (estaObsoleto()) return false

    const rcanal = global.rcanal || {
      contextInfo: {
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: '120363423390538090@newsletter',
          serverMessageId: 100,
          newsletterName: '༼ 𝙋𝙖𝙞𝙣 𝘾𝙤𝙢𝙢𝙪𝙣𝙞𝙩𝙮 ༽'
        }
      }
    }

    const nombreUsuario = m.pushName || m.name || 'Usuario'
    const nombreGrupo = await conn.getName(m.chat) || 'Grupo'

    await conn.sendPresenceUpdate('composing', m.chat).catch(() => {})

    const respuesta = await callGeminiHotAPI(texto, nombreUsuario, nombreGrupo, m.chat)

    if (estaObsoleto()) {
      await conn.sendPresenceUpdate('paused', m.chat).catch(() => {})
      return false
    }

    if (respuesta && respuesta.length > 0) {
      await retraso(400 + Math.floor(Math.random() * 500))
      if (estaObsoleto()) {
        await conn.sendPresenceUpdate('paused', m.chat).catch(() => {})
        return false
      }

      await conn.sendPresenceUpdate('paused', m.chat).catch(() => {})
      await conn.sendMessage(m.chat, {
        text: respuesta,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
      return true
    }

    await conn.sendPresenceUpdate('paused', m.chat).catch(() => {})
    return false
  } catch (error) {
    console.error('Error en Modo Hot:', error)
    return false
  }
}

export { manejarModoHot as handleModoHot }
