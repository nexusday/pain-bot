import NodeCache from 'node-cache'
import { metadataEnCache } from './group-meta-cache.js'

const temporizadoresPrekeys = new WeakMap()

// Lista de dispositivos por usuario compartida entre todos los sockets.
// Sin esto, 158 sub-bots que escriben al mismo grupo repiten la consulta
// USync del mismo usuario 158 veces. La lista es del usuario, no del bot, así
// que compartirla es seguro y reduce consultas, CPU y cortes por saturación.
const _cacheDispositivos = new NodeCache({
  stdTTL: 300,
  checkperiod: 60,
  useClones: false,
  maxKeys: 5000,
})

// Baileys usa `mset([{ key, value }])`, pero `node-cache` espera `{ key, val }`.
// Este adaptador evita que la lista de dispositivos se guarde como undefined.
const cacheDispositivosCompartida = {
  get: (key) => _cacheDispositivos.get(key),
  set: (key, value, ttl) => _cacheDispositivos.set(key, value, ttl),
  mget: (keys) => _cacheDispositivos.mget(keys),
  mset: (entradas) => {
    for (const entrada of entradas || []) {
      if (entrada && entrada.key !== undefined) {
        _cacheDispositivos.set(entrada.key, entrada.value, entrada.ttl)
      }
    }
    return true
  },
}

/**
 * Opciones que evitan que el socket se corte cuando hay muchos sub-bots.
 * El keepalive sube a 60 s para tolerar pausas del event loop y las consultas
 * de WhatsApp tienen límite para no quedar colgadas.
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
    shouldIgnoreJid: opciones.shouldIgnoreJid || ignorarJidInutil,
    generateHighQualityLinkPreview: false,
    // 60 s da margen a una pausa real del event loop (GC, SQLite, disco) sin
    // que Baileys cierre TODOS los sockets con 408. El ping se sigue enviando
    // cada minuto; WhatsApp no ve una conexión inactiva.
    keepAliveIntervalMs: opciones.keepAliveIntervalMs || 60_000,
    defaultQueryTimeoutMs: opciones.defaultQueryTimeoutMs || 60_000,
    connectTimeoutMs: opciones.connectTimeoutMs || 60_000,
    retryRequestDelayMs: 400,
    maxMsgRetryCount: 5,
    userDevicesCache: opciones.userDevicesCache || cacheDispositivosCompartida,
    // Nombre correcto en Baileys 7. El bot venía pasando `msgRetryCache`,
    // que Baileys ignora y crea otro caché por socket.
    msgRetryCounterCache: opciones.msgRetryCounterCache || opciones.msgRetryCache,
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
