/* Estadísticas globales de actividad del bot para el panel. */

const MAX_RECIENTES = 10
const comandos = new Map()
const recientes = []
let cargado = false
let persistenciaPendiente = null

function cargarPersistencia() {
  if (cargado) return
  cargado = true
  const guardado = global.db?.data?.panelStats
  for (const [command, count] of Object.entries(guardado?.commands || {})) {
    if (Number(count) > 0) comandos.set(command, Number(count))
  }
  if (Array.isArray(guardado?.recent)) recientes.push(...guardado.recent.slice(0, MAX_RECIENTES))
}

function guardarPronto() {
  if (persistenciaPendiente || !global.db?.data) return
  persistenciaPendiente = setTimeout(async () => {
    persistenciaPendiente = null
    global.db.data.panelStats = {
      commands: Object.fromEntries(comandos),
      recent: recientes.slice(0, MAX_RECIENTES),
    }
    try { await global.db.write?.() } catch {}
  }, 5000)
  persistenciaPendiente.unref?.()
}

function conexiones() {
  return [...new Set([global.conn, ...(Array.isArray(global.conns) ? global.conns : [])].filter(Boolean))]
}

function nombreComando(valor) {
  return String(valor || '').trim().toLowerCase().replace(/^[.!#/]+/, '')
}

export function registrarComandoGlobal(command, chatId, conn) {
  cargarPersistencia()
  const comando = nombreComando(command)
  if (!comando) return
  comandos.set(comando, (comandos.get(comando) || 0) + 1)
  recientes.unshift({
    command: comando,
    group: Boolean(String(chatId || '').endsWith('@g.us')),
    at: Date.now(),
    bot: String(conn?.user?.jid || conn?.user?.id || '').split('@')[0].split(':')[0] || null,
  })
  if (recientes.length > MAX_RECIENTES) recientes.length = MAX_RECIENTES
  guardarPronto()
}

function gruposActivos() {
  if (Number.isFinite(global.webPanelPreview?.activeGroups)) return global.webPanelPreview.activeGroups
  const desactivados = global.db?.data?.botGroups || {}
  const grupos = new Set()
  for (const conn of conexiones()) {
    for (const id of Object.keys(conn.chats || {})) {
      if (id.endsWith('@g.us') && desactivados[id] !== false) grupos.add(id)
    }
  }
  return grupos.size
}

function totalComandosDisponibles() {
  if (Number.isFinite(global.webPanelPreview?.totalCommands)) return global.webPanelPreview.totalCommands
  const nombres = new Set()
  for (const plugin of Object.values(global.plugins || {})) {
    for (const command of Array.isArray(plugin?.command) ? plugin.command : []) {
      if (typeof command === 'string' && command.trim()) nombres.add(command.trim().toLowerCase())
    }
  }
  return nombres.size
}

export function estadisticasGlobales() {
  cargarPersistencia()
  const previewTop = global.webPanelPreview?.topCommands
  const previewRecent = global.webPanelPreview?.recentCommands
  return {
    activeGroups: gruposActivos(),
    totalCommands: totalComandosDisponibles(),
    topCommands: Array.isArray(previewTop) ? previewTop : [...comandos.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([command, count]) => ({ command, count })),
    recentCommands: Array.isArray(previewRecent) ? previewRecent : recientes.slice(0, MAX_RECIENTES),
  }
}
