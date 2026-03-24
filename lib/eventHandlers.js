/**
 * Event Handlers - Modos de IA y respuestas automáticas
 * Coordinador principal que importa desde la carpeta Modos
 */

import { handleModoIA } from './Modos/modo-ia.js'
import { handleModoHot } from './Modos/modo-hot.js'
import { handleModoIlegal } from './Modos/modo-ilegal.js'

export async function handleAIModes(m, conn) {
  
  const results = await Promise.allSettled([
    handleModoIA(m, conn),
    handleModoHot(m, conn),
    handleModoIlegal(m, conn)
  ])

 
  return results.some(result =>
    result.status === 'fulfilled' && result.value === true
  )
}
