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

function esBotPropio(conn, sender) {
  if (!sender) return false
  const senderLimpio = String(sender).split('@')[0].split(':')[0].replace(/\D/g, '')
  if (senderLimpio.length < 6) return false

  const idsDe = (c) => {
    const out = new Set()
    for (const v of [
      c?.user?.jid,
      c?.user?.id,
      c?.user?.lid,
      c?.phoneNumber,
      c?.botNumber,
      c?.authState?.creds?.me?.id,
      c?.authState?.creds?.me?.lid,
    ]) {
      const n = String(v || '').split('@')[0].split(':')[0].replace(/\D/g, '')
      if (n.length >= 6) out.add(n)
    }
    return out
  }

  if (idsDe(conn).has(senderLimpio)) return true
  if (idsDe(global.conn).has(senderLimpio)) return true

  if (global.conns && Array.isArray(global.conns)) {
    return global.conns.some(bot => idsDe(bot).has(senderLimpio))
  }

  return false
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
  if (!m?.isGroup || m.fromMe || esBotPropio(conn, m.sender)) return false

  const resultados = await Promise.allSettled([
    manejarAntiImg(m, conn, esAdmin, participants),
    manejarAntiAudio(m, conn, esAdmin, participants),
    manejarAntiVideo(m, conn, esAdmin, participants),
    manejarAntiSticker(m, conn, esAdmin, participants),
    manejarAntiDocumento(m, conn, esAdmin, participants),
  ])

  return resultados.some(r => r.status === 'fulfilled' && r.value === true)
}

export async function manejarSistemasAnti(m, conn, esAdmin, esOwner, esRAdmin, esBotAdmin, esPrems, comandoEjecutado, participants = []) {
  const rcanal = rcanalCtx()

  if (esBotPropio(conn, m.sender) || m.fromMe) {
    return false
  }

  const resultados = await Promise.allSettled([
    manejarAntiEstados(m, conn, esAdmin),
    manejarAntiBot(m, conn, esAdmin, rcanal),
    manejarAntiLink(m, conn, esAdmin, rcanal),
    manejarAntiImg(m, conn, esAdmin, participants),
    manejarAntiAudio(m, conn, esAdmin, participants),
    manejarAntiVideo(m, conn, esAdmin, participants),
    manejarAntiSticker(m, conn, esAdmin, participants),
    manejarAntiSpam(m, conn, esAdmin, rcanal),
    manejarAntiContacto(m, conn, esAdmin),
    manejarAntiMencion(m, conn, esAdmin, rcanal),
    manejarAntiDocumento(m, conn, esAdmin, participants),
    manejarAntiCaracter(m, conn, esAdmin, rcanal),
    manejarAntiPalabra(m, conn, esAdmin, rcanal, esOwner),
    manejarSoloAdmin(m, conn, esAdmin, esOwner, rcanal),
   
    manejarSugerenciasComando(m, conn, comandoEjecutado, esAdmin, esOwner)
  ])

  return resultados.some(resultado =>
    resultado.status === 'fulfilled' && resultado.value === true
  )
}

export {
  manejarSistemasAnti as handleAntiSystems,
  manejarAntiMediaTemprano as handleAntiMediaEarly,
}
