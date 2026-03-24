/**
 * Anti Handlers - Sistemas de protección y restricciones
 * Coordinador principal que importa desde la carpeta Antis
 */

import { handleAntiLink } from './Antis/anti-link.js'
import { handleAntiImg } from './Antis/anti-img.js'
import { handleAntiAudio } from './Antis/anti-audio.js'
import { handleAntiVideo } from './Antis/anti-video.js'
import { handleAntiSticker } from './Antis/anti-sticker.js'
import { handleAntiSpam } from './Antis/anti-spam.js'
import { handleAntiContact } from './Antis/anti-contact.js'
import { handleAntiMention } from './Antis/anti-mention.js'
import { handleAntiDocument } from './Antis/anti-document.js'
import { handleAntiCaracter } from './Antis/anti-caracter.js'
import { handleSoloAdmin } from './Antis/solo-admin.js'
import { handleCommandSuggestions } from './Antis/command-suggestions.js'

export async function handleAntiSystems(m, conn, isAdmin, isOwner, isRAdmin, isBotAdmin, isPrems, commandExecuted) {
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

  
  const isOwnBot = (sender) => {
    const cleanSender = sender?.split('@')[0] || sender

    const mainBotJid = conn.user?.jid?.split('@')[0] || conn.user?.id?.split('@')[0]
    if (cleanSender === mainBotJid) return true

    if (global.mainBotJid && cleanSender === global.mainBotJid) return true

    if (global.conns && Array.isArray(global.conns)) {
      return global.conns.some(bot => {
        const botJid = bot.user?.jid?.split('@')[0] || bot.user?.id?.split('@')[0]
        return cleanSender === botJid
      })
    }

    return false
  }

  
  if (isOwnBot(m.sender)) {
    return false
  }

  
  const results = await Promise.allSettled([
    handleAntiLink(m, conn, isAdmin, rcanal),
    handleAntiImg(m, conn, isAdmin),
    handleAntiAudio(m, conn, isAdmin),
    handleAntiVideo(m, conn, isAdmin),
    handleAntiSticker(m, conn, isAdmin),
    handleAntiSpam(m, conn, isAdmin, rcanal),
    handleAntiContact(m, conn, isAdmin),
    handleAntiMention(m, conn, isAdmin, rcanal),
    handleAntiDocument(m, conn, isAdmin),
    handleAntiCaracter(m, conn, isAdmin, rcanal),
    handleSoloAdmin(m, conn, isAdmin, isOwner, rcanal),
    handleCommandSuggestions(m, conn, commandExecuted)
  ])

  
  return results.some(result =>
    result.status === 'fulfilled' && result.value === true
  )
}
