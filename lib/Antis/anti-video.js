/**
 * Sistema Anti-Video
 */

import { manejarAntiMedia } from './anti-media-utils.js'

export async function manejarAntiVideo(m, conn, esAdmin, participants = []) {
  return manejarAntiMedia(m, conn, esAdmin, {
    dbKey: 'antiVideo',
    tipos: ['videoMessage', 'ptvMessage'],
    etiqueta: 'anti-video',
    participants,
  })
}

export { manejarAntiVideo as handleAntiVideo }
