/**
 * Sistema Anti-Document
 */

import { manejarAntiMedia } from './anti-media-utils.js'

export async function manejarAntiDocumento(m, conn, esAdmin, participants = []) {
  return manejarAntiMedia(m, conn, esAdmin, {
    dbKey: 'antiDocument',
    tipos: ['documentMessage'],
    etiqueta: 'anti-document',
    participants,
  })
}

export { manejarAntiDocumento as handleAntiDocument }
