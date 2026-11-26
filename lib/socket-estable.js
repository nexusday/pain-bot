import { metadataEnCache } from './group-meta-cache.js'

const temporizadoresPrekeys = new WeakMap()

/**
 * Opciones que evitan que el socket se corte cuando hay muchos sub-bots.
 * Se conserva el keepalive predeterminado de Baileys y las consultas de WhatsApp no se quedan
 * colgadas un minuto.
 */
// Estados y canales no se usan: se descartan antes de descifrarlos (cada sub-bot los recibía todos).
export function ignorarJidInutil(jid = '') {
  return jid === 'status@broadcast' || String(jid).endsWith('@newsletter')
}

export function conSocketEstable(opciones = {}) {
  const obtenerSocket = typeof opciones.getMessageSocket === 'function'
    ? opciones.getMessageSocket
    : null
  return {
    ...opciones,
    syncFullHistory: false,
    // Sin historial completo: el bot no necesita reinyectar miles de mensajes
    // viejos al reconectar. Los subbots pasan su propia función (nombres).
    shouldSyncHistoryMessage: opciones.shouldSyncHistoryMessage || (() => false),
    shouldIgnoreJid: ignorarJidInutil,
    generateHighQualityLinkPreview: false,
    keepAliveIntervalMs: opciones.keepAliveIntervalMs || 30_000,
    defaultQueryTimeoutMs: opciones.defaultQueryTimeoutMs || 60_000,
    connectTimeoutMs: opciones.connectTimeoutMs || 60_000,
    retryRequestDelayMs: 400,
    maxMsgRetryCount: 5,
    transactionOpts: { maxCommitRetries: 4, delayBetweenTriesMs: 1500 },
    cachedGroupMetadata: async (jid) => metadataEnCache(jid) || undefined,
    getMessage: opciones.getMessage || (async (key) => {
      const jid = key?.remoteJid
      const id = key?.id
      if (!jid || !id) return undefined
      // Cada socket busca SOLO en su propio caché. Antes se recorrían todos
      // los sockets: costo O(N) por reintento y riesgo de devolver el mensaje
      // de otro bot.
      const propio = obtenerSocket?.()
      if (propio?.chats?.[jid]?.messages?.[id]?.message) {
        return propio.chats[jid].messages[id].message
      }
      if (propio) {
        const guardado = propio.chats?.[jid]?.messages
        if (guardado) {
          for (const mensaje of Object.values(guardado)) {
            if (mensaje?.key?.id === id && mensaje?.message) return mensaje.message
          }
        }
        return undefined
      }
      for (const sock of [global.conn, ...(global.conns || [])]) {
        const guardado = sock?.chats?.[jid]?.messages?.[id]
        if (guardado?.message) return guardado.message
      }
      return undefined
    }),
  }
}

export function mantenerPrekeys(sock) {
  if (!sock?.uploadPreKeysToServerIfRequired || temporizadoresPrekeys.has(sock)) return
  const temporizador = setInterval(() => {
    sock.uploadPreKeysToServerIfRequired().catch(() => {})
  }, 6 * 60 * 60 * 1000)
  temporizador.unref?.()
  temporizadoresPrekeys.set(sock, temporizador)
}

export function detenerPrekeys(sock) {
  const temporizador = sock && temporizadoresPrekeys.get(sock)
  if (!temporizador) return
  clearInterval(temporizador)
  temporizadoresPrekeys.delete(sock)
}
