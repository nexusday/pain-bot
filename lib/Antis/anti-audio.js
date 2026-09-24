/**
 * Sistema Anti-Audio
 */

import { manejarAntiMedia } from './anti-media-utils.js'

export async function manejarAntiAudio(m, conn, esAdmin, participants = []) {
  return manejarAntiMedia(m, conn, esAdmin, {
    dbKey: 'antiAudio',
    tipos: ['audioMessage'],
    etiqueta: 'anti-audio',
    participants,
  })
}

export { manejarAntiAudio as handleAntiAudio }
