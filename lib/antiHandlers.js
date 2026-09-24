/**
 * Anti Handlers - Sistemas de protección y restricciones
 * Coordinador principal que importa desde la carpeta Antis
 */

import { manejarAntiLink } from './Antis/anti-link.js'
import { manejarAntiImg } from './Antis/anti-img.js'
import { manejarAntiAudio } from './Antis/anti-audio.js'
import { manejarAntiVideo } from './Antis/anti-video.js'
import { manejarAntiSticker } from './Antis/anti-sticker.js'
import { manejarAntiSpam } from './Antis/anti-spam.js'
import { manejarAntiContacto } from './Antis/anti-contact.js'
import { manejarAntiMencion } from './Antis/anti-mention.js'
import { manejarAntiDocumento } from './Antis/anti-document.js'
import { manejarAntiCaracter } from './Antis/anti-caracter.js'
import { manejarAntiPalabra } from './Antis/anti-palabra.js'
import { manejarAntiBot } from './Antis/anti-bot.js'
import { manejarAntiEstados } from './Antis/anti-estados.js'
import { manejarSoloAdmin } from './Antis/solo-admin.js'
import { manejarSugerenciasComando } from './Antis/command-suggestions.js'
import { detectarTipoAntiMedia } from './Antis/anti-media-utils.js'

/**
 * Solo el socket actual (este conn), no otros subbots Pain.
 */
function esEsteMismoBot(conn, sender) {
  if (!sender || !conn) return false
  const senderStr = String(sender)
  const senderLimpio = senderStr.split('@')[0].split(':')[0].replace(/\D/g, '')
  if (senderLimpio.length < 6) return false

  const esLid = senderStr.includes('@lid')
  const esPn = senderStr.includes('@s.whatsapp.net') || senderStr.includes('@c.us')

  const lids = new Set()
  const pns = new Set()
  const add = (v, forzar) => {
    if (!v) return
    const s = String(v)
    const n = s.split('@')[0].split(':')[0].replace(/\D/g, '')
    if (n.length < 6) return
    if (forzar === 'lid' || s.includes('@lid')) lids.add(n)
    else if (forzar === 'pn' || s.includes('@s.whatsapp.net') || s.includes('@c.us')) pns.add(n)
    else pns.add(n)
  }
  add(conn.user?.jid)
  add(conn.user?.id)
  add(conn.user?.lid, 'lid')
  add(conn.phoneNumber, 'pn')
  add(conn.botNumber, 'pn')
  add(conn.authState?.creds?.me?.id)
  add(conn.authState?.creds?.me?.lid, 'lid')

  if (esLid) return lids.has(senderLimpio)
  if (esPn) return pns.has(senderLimpio)
  return lids.has(senderLimpio) || pns.has(senderLimpio)
}

function rcanalCtx() {
  return global.rcanal || {
    contextInfo: {
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: '',
        serverMessageId: 100,
        newsletterName: ''
      }
    }
  }
}


export async function manejarAntiMediaTemprano(m, conn, esAdmin, participants = []) {
  if (!m?.isGroup || m.fromMe || esEsteMismoBot(conn, m.sender)) return false

  const tipo = detectarTipoAntiMedia(m)
  if (!tipo) return false

  const mapa = {
    sticker: manejarAntiSticker,
    image: manejarAntiImg,
    video: manejarAntiVideo,
    audio: manejarAntiAudio,
    document: manejarAntiDocumento,
  }
  const fn = mapa[tipo]
  if (!fn) return false

  try {
    return (await fn(m, conn, esAdmin, participants)) === true
  } catch (e) {
    console.error('Error anti-media temprano:', e?.message || e)
    return false
  }
}

export async function manejarSistemasAnti(m, conn, esAdmin, esOwner, esRAdmin, esBotAdmin, esPrems, comandoEjecutado, participants = []) {
  const rcanal = rcanalCtx()

  if (m.fromMe || esEsteMismoBot(conn, m.sender)) {
    return false
  }


  const resultados = await Promise.allSettled([
    manejarAntiEstados(m, conn, esAdmin),
    manejarAntiBot(m, conn, esAdmin, rcanal),
    manejarAntiLink(m, conn, esAdmin, rcanal),
    manejarAntiSpam(m, conn, esAdmin, rcanal),
    manejarAntiContacto(m, conn, esAdmin),
    manejarAntiMencion(m, conn, esAdmin, rcanal),
    manejarAntiCaracter(m, conn, esAdmin, rcanal),
    manejarAntiPalabra(m, conn, esAdmin, rcanal, esOwner),
    manejarSoloAdmin(m, conn, esAdmin, esOwner, rcanal),
    manejarSugerenciasComando(m, conn, comandoEjecutado, esAdmin, esOwner),
  ])

  return resultados.some(resultado =>
    resultado.status === 'fulfilled' && resultado.value === true
  )
}

export {
  manejarSistemasAnti as handleAntiSystems,
  manejarAntiMediaTemprano as handleAntiMediaEarly,
}
