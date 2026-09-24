/**
 * Sistema Anti-Imagen
 */

import { manejarAntiMedia } from './anti-media-utils.js'

export async function manejarAntiImg(m, conn, esAdmin, participants = []) {
  return manejarAntiMedia(m, conn, esAdmin, {
    dbKey: 'antiImg',
    tipos: ['imageMessage'],
    etiqueta: 'anti-img',
    participants,
  })
}

export { manejarAntiImg as handleAntiImg }
