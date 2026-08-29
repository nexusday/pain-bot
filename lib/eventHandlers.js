/**
 * Event Handlers - Modos de IA y respuestas automáticas
 * Coordinador principal que importa desde la carpeta Modos
 */

import { handleModoIA } from './Modos/modo-ia.js'
import { handleModoHot } from './Modos/modo-hot.js'
import { handleModoIlegal } from './Modos/modo-ilegal.js'
import { handleModoHuman } from './Modos/modo-human.js'
import { handleModoSad } from './Modos/modo-sad.js'
import { handleModoPsico } from './Modos/modo-psico.js'
import { shouldSkipByModoSub } from '../plugins/modo-sub.js'

export async function handleAIModes(m, conn) {
  if (m.isGroup && !m.fromMe) {
    try {
      if (shouldSkipByModoSub(conn, m.chat, {
        text: m.text || '',
        prefix: global.prefix
      })) return false
    } catch {}
  }

  const results = await Promise.allSettled([
    handleModoHuman(m, conn),
    handleModoSad(m, conn),
    handleModoPsico(m, conn),
    handleModoIA(m, conn),
    handleModoHot(m, conn),
    handleModoIlegal(m, conn)
  ])

 
  return results.some(result =>
    result.status === 'fulfilled' && result.value === true
  )
}
