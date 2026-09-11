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
import { manejarSoloAdmin } from './Antis/solo-admin.js'
import { manejarSugerenciasComando } from './Antis/command-suggestions.js'

export async function manejarSistemasAnti(m, conn, esAdmin, esOwner, esRAdmin, esBotAdmin, esPrems, comandoEjecutado) {
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

  const esBotPropio = (sender) => {
    const senderLimpio = sender?.split('@')[0] || sender

    const jidBotPrincipal = conn.user?.jid?.split('@')[0] || conn.user?.id?.split('@')[0]
    if (senderLimpio === jidBotPrincipal) return true

    if (global.mainBotJid && senderLimpio === global.mainBotJid) return true

    if (global.conns && Array.isArray(global.conns)) {
      return global.conns.some(bot => {
        const botJid = bot.user?.jid?.split('@')[0] || bot.user?.id?.split('@')[0]
        return senderLimpio === botJid
      })
    }

    return false
  }

  if (esBotPropio(m.sender)) {
    return false
  }

  const resultados = await Promise.allSettled([
    manejarAntiLink(m, conn, esAdmin, rcanal),
    manejarAntiImg(m, conn, esAdmin),
    manejarAntiAudio(m, conn, esAdmin),
    manejarAntiVideo(m, conn, esAdmin),
    manejarAntiSticker(m, conn, esAdmin),
    manejarAntiSpam(m, conn, esAdmin, rcanal),
    manejarAntiContacto(m, conn, esAdmin),
    manejarAntiMencion(m, conn, esAdmin, rcanal),
    manejarAntiDocumento(m, conn, esAdmin),
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
  manejarSistemasAnti as handleAntiSystems
}
