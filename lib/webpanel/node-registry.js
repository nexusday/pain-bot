/**
 * Registro en memoria de los agentes de nodo conectados al panel.
 *
 * Modelo Pterodactyl/Wings: el agente de la VPS abre una WebSocket hacia el
 * panel. El panel no necesita abrir puertos ni conocer la IP del nodo; solo
 * guarda la conexión y le envía comandos por ella.
 */
const conexiones = new Map() // nodeId -> { ws, lastSeen, hello, pending }
let secuencia = 0

export function registrarNodo(nodeId, ws) {
  const id = Number(nodeId)
  const estado = {
    ws,
    lastSeen: Date.now(),
    hello: null,
    carriles: [],
    pending: new Map(),
  }
  conexiones.set(id, estado)
  ws.on('message', (raw) => {
    let mensaje = null
    try { mensaje = JSON.parse(String(raw)) } catch { return }
    if (!mensaje || typeof mensaje !== 'object') return
    estado.lastSeen = Date.now()
    if (mensaje.type === 'hello' || mensaje.type === 'stats') {
      estado.hello = mensaje
      estado.carriles = Array.isArray(mensaje.carriles) ? mensaje.carriles : estado.carriles
      return
    }
    if (mensaje.type === 'result') {
      const pendiente = estado.pending.get(mensaje.requestId)
      if (!pendiente) return
      estado.pending.delete(mensaje.requestId)
      clearTimeout(pendiente.temporizador)
      pendiente.resolve(mensaje.resultado || mensaje)
    }
  })
  ws.on('close', () => {
    if (conexiones.get(id)?.ws === ws) conexiones.delete(id)
  })
  ws.on('error', () => {
    if (conexiones.get(id)?.ws === ws) conexiones.delete(id)
  })
}

export function quitarNodo(nodeId, ws = null) {
  const id = Number(nodeId)
  const actual = conexiones.get(id)
  if (!actual) return
  if (ws && actual.ws !== ws) return
  conexiones.delete(id)
}

export function estaEnLinea(nodeId) {
  const estado = conexiones.get(Number(nodeId))
  return Boolean(estado && estado.ws.readyState === 1)
}

export function estadoNodo(nodeId) {
  const estado = conexiones.get(Number(nodeId))
  if (!estado) return { online: false, hello: null, lastSeen: 0, carriles: [] }
  return {
    online: estado.ws.readyState === 1,
    hello: estado.hello,
    lastSeen: estado.lastSeen,
    carriles: estado.carriles,
  }
}

export function listarNodosConectados() {
  return [...conexiones.entries()].map(([id, estado]) => ({
    id,
    online: estado.ws.readyState === 1,
    lastSeen: estado.lastSeen,
    hello: estado.hello,
    carriles: estado.carriles,
  }))
}

export function enviarComando(nodeId, tipo, datos = {}, timeoutMs = 45_000) {
  const estado = conexiones.get(Number(nodeId))
  if (!estado || estado.ws.readyState !== 1) {
    return Promise.resolve({ ok: false, error: 'offline' })
  }
  const requestId = `${Date.now()}-${++secuencia}`
  return new Promise((resolve) => {
    const temporizador = setTimeout(() => {
      estado.pending.delete(requestId)
      resolve({ ok: false, error: 'timeout' })
    }, Math.max(5_000, Number(timeoutMs) || 45_000))
    estado.pending.set(requestId, { resolve, temporizador })
    try {
      estado.ws.send(JSON.stringify({ type: tipo, requestId, ...datos }))
    } catch (error) {
      clearTimeout(temporizador)
      estado.pending.delete(requestId)
      resolve({ ok: false, error: error?.message || 'send-failed' })
    }
  })
}
