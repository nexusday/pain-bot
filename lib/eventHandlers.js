/**
 * Event Handlers - Modos de IA y respuestas automáticas
 * Coordinador principal que importa desde la carpeta Modos
 */

import { manejarModoIA } from './Modos/modo-ia.js'
import { manejarModoHot } from './Modos/modo-hot.js'
import { manejarModoIlegal } from './Modos/modo-ilegal.js'
import { manejarModoHumano } from './Modos/modo-human.js'
import { manejarModoSad } from './Modos/modo-sad.js'
import { manejarModoPsico } from './Modos/modo-psico.js'
import { shouldSkipByModoSub } from '../plugins/modo-sub.js'

export async function manejarModosIA(m, conn) {
  if (m.isGroup) {
    try {
      if (shouldSkipByModoSub(conn, m.chat, {
        allowModoSubCommand: true,
        text: m.text || '',
        prefix: global.prefix
      })) return false
    } catch {}
  }

  if (m.fromMe) return false

  const resultados = await Promise.allSettled([
    manejarModoHumano(m, conn),
    manejarModoSad(m, conn),
    manejarModoPsico(m, conn),
    manejarModoIA(m, conn),
    manejarModoHot(m, conn),
    manejarModoIlegal(m, conn)
  ])

 
  return resultados.some(resultado =>
    resultado.status === 'fulfilled' && resultado.value === true
  )
}

export { manejarModosIA as handleAIModes }
