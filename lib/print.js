import chalk from 'chalk'
import { watchFile } from 'fs'
import { extractNewsletterFromMessage, isNewsletterJid } from './newsletter-rcanal.js'

let stdoutSaturado = false
let logsOmitidos = 0

// Log de cada mensaje. Con 150+ sub-bots en grupos activos esto es mucho
// I/O de stdout (consola de Pterodactyl + archivo de log). Es opt-in para
// proteger el límite de CPU; se activa explícitamente con PAIN_LOG_MENSAJES=1.
const LOG_MENSAJES = process.env.PAIN_LOG_MENSAJES === '1'

function escribirLogMensaje(linea) {
  if (stdoutSaturado) {
    logsOmitidos++
    return
  }

  if (process.stdout.write(`${linea}\n`)) return
  stdoutSaturado = true
  process.stdout.once('drain', () => {
    stdoutSaturado = false
    if (!logsOmitidos) return
    const omitidos = logsOmitidos
    logsOmitidos = 0
    escribirLogMensaje(`[logs] Se omitieron ${omitidos} registros de mensajes por saturación de salida.`)
  })
}

function limpiarTexto(text) {
  if (!text) return 'Sin nombre'

  let limpio = text
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/[\uFFF0-\uFFFF]/g, '')
    .replace(/�/g, '')
    .replace(/[\u200B-\u200F\u202A-\u202E]/g, '')
    .replace(/[\uE000-\uF8FF]/g, '')
    .trim()

  return limpio || 'Usuario'
}

function detectarDispositivo(m) {
  try {
    if (m.key && m.key.id) {
      const keyId = m.key.id

      if (keyId.startsWith('3EB0') && keyId.length === 20) {
        return 'WhatsApp Web'
      }

      if (/^[A-F0-9]{20}$/i.test(keyId)) {
        return 'Android'
      }

      if (keyId.length < 20 && /^[A-F0-9]+$/i.test(keyId)) {
        return 'iOS'
      }
    }

    if (m.message) {
      if (m.message.messageContextInfo ||
          (m.message.extendedTextMessage && m.message.extendedTextMessage.contextInfo)) {
        return 'WhatsApp Web'
      }
    }

    if (m.sender && m.sender.includes('@c.us')) {
      return 'WhatsApp Web'
    }

    return 'Android'

  } catch (error) {
    return 'Android'
  }
}

function detectarTipoMensaje(m) {
  try {
    if (!m.message) return 'Sin mensaje'

    if (m.message.imageMessage ||
        m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
      return 'imageMessage'
    }

    if (m.message.videoMessage ||
        m.message.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage) {
      return 'videoMessage'
    }

    if (m.message.audioMessage ||
        m.message.extendedTextMessage?.contextInfo?.quotedMessage?.audioMessage) {
      return 'audioMessage'
    }

    if (m.message.stickerMessage ||
        m.message.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage) {
      return 'stickerMessage'
    }

    if (m.message.documentMessage ||
        m.message.extendedTextMessage?.contextInfo?.quotedMessage?.documentMessage) {
      return 'documentMessage'
    }

    if (m.message.contactMessage ||
        m.message.extendedTextMessage?.contextInfo?.quotedMessage?.contactMessage) {
      return 'contactMessage'
    }

    if (m.message.extendedTextMessage) {
      return 'extendedTextMessage'
    }

    if (m.message.conversation) {
      return 'conversation'
    }

    return m.mtype || 'Desconocido'

  } catch (error) {
    return 'Error'
  }
}

async function imprimirMensaje(m, conn = { user: {} }) {
  if (!LOG_MENSAJES) return
  if (m.messageStubType && !m.text && !m.mtype) {
    return
  }

  if (m.message) {
    const chatGuardado = conn.chats?.[m.chat]
    let remitenteCrudo = m.pushName || m.name || 'Usuario'
    let desdeCrudo = chatGuardado?.subject || chatGuardado?.name || m.chat || 'Chat'
    let cuerpoCrudo = m.text || m.caption || '[Sin texto]'

    let remitente = limpiarTexto(remitenteCrudo)
    let desde = limpiarTexto(desdeCrudo)
    let cuerpo = limpiarTexto(cuerpoCrudo)
    let dispositivo = detectarDispositivo(m)
    let tipoMensaje = detectarTipoMensaje(m)
    const chatJid = m.chat || m.key?.remoteJid || ''
    const infoNewsletter = extractNewsletterFromMessage(m)

    if (cuerpo.length > 100) cuerpo = `${cuerpo.substring(0, 97)}...`

    escribirLogMensaje(
      `[${tipoMensaje} | ${dispositivo}] ${remitente} en ${desde}: ${cuerpo}` +
      `${infoNewsletter.jid ? ` | canal ${infoNewsletter.name || infoNewsletter.jid}` : isNewsletterJid(chatJid) ? ` | canal ${chatJid}` : ''}`
    )
  }
}

export default imprimirMensaje

let archivo = global.__filename(import.meta.url)
watchFile(archivo, () => {
  console.log(chalk.redBright("Update 'lib/print.js'"))
})
