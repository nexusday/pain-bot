/**
 * Sistema Anti-Sticker
 */

import { manejarAntiMedia } from './anti-media-utils.js'

export async function manejarAntiSticker(m, conn, esAdmin, participants = []) {
  return manejarAntiMedia(m, conn, esAdmin, {
    dbKey: 'antiSticker',
    tipos: ['stickerMessage', 'lottieStickerMessage'],
    etiqueta: 'anti-sticker',
    participants,
  })
}

export { manejarAntiSticker as handleAntiSticker }
