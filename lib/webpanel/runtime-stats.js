/* Estadísticas globales de actividad del bot para el panel. */

import fs from 'node:fs'
import path from 'node:path'

const MAX_RECIENTES = 10
const comandos = new Map()
const recientes = []
let cargado = false
let persistenciaPendiente = null
const statsDir = path.resolve(process.cwd(), 'storage', 'runtime-stats')
const statsFile = path.join(statsDir, `${process.pid}.json`)

function cargarPersistencia() {
  if (cargado) return
  cargado = true
  let guardado = null
  try { guardado = JSON.parse(fs.readFileSync(statsFile, 'utf8')) } catch {}
  for (const [command, count] of Object.entries(guardado?.commands || {})) {
    if (Number(count) > 0) comandos.set(command, Number(count))
  }
  if (Array.isArray(guardado?.recent)) recientes.push(...guardado.recent.slice(0, MAX_RECIENTES))
}

function guardarPronto() {
  if (persistenciaPendiente) return
  persistenciaPendiente = setTimeout(async () => {
    persistenciaPendiente = null
    const datos = {
      commands: Object.fromEntries(comandos),
      recent: recientes.slice(0, MAX_RECIENTES),
    }
    try {
      await fs.promises.mkdir(statsDir, { recursive: true })
      await fs.promises.writeFile(statsFile, JSON.stringify(datos), { mode: 0o600 })
    } catch {}
  }, 5000)
  persistenciaPendiente.unref?.()
}

function conexiones() {
  return [...new Set([global.conn, ...(Array.isArray(global.conns) ? global.conns : [])].filter(Boolean))]
}

let cacheGrupos = { datos: null, at: 0, valor: 0 }

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

/**
 * Grupos activos reales: la DB compartida `chats` acumula los grupos de TODOS
 * los workers (SQLite los fusiona), no solo los del proceso principal. Antes
 * se contaban únicamente los sockets locales y por eso el número se quedaba
 * clavado alrededor de los grupos del principal.
 */
export function contarGruposActivos(datos = global.db?.data) {
  const ahora = Date.now()
  if (cacheGrupos.datos === datos && ahora - cacheGrupos.at < 30_000) return cacheGrupos.valor
  const desactivados = datos?.botGroups || {}
  const grupos = new Set()
  const chats = datos?.chats || {}
  for (const id of Object.keys(chats)) {
    if (id.endsWith('@g.us') && desactivados[id] !== false) grupos.add(id)
  }
  for (const [id, activo] of Object.entries(desactivados)) {
    if (id.endsWith('@g.us') && activo !== false) grupos.add(id)
  }
  // Primer arranque: si la DB aún no tiene chats, se usan los sockets locales.
  if (!grupos.size) {
    for (const conn of conexiones()) {
      for (const id of Object.keys(conn.chats || {})) {
        if (id.endsWith('@g.us') && desactivados[id] !== false) grupos.add(id)
      }
    }
  }
  cacheGrupos = { datos, at: ahora, valor: grupos.size }
  return grupos.size
}

function gruposActivos() {
  if (Number.isFinite(global.webPanelPreview?.activeGroups)) return global.webPanelPreview.activeGroups
  return contarGruposActivos()
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
  const todos = new Map(comandos)
  const recientesGlobales = [...recientes]
  try {
    for (const nombre of fs.readdirSync(statsDir)) {
      if (!nombre.endsWith('.json') || nombre === `${process.pid}.json`) continue
      let datos
      try { datos = JSON.parse(fs.readFileSync(path.join(statsDir, nombre), 'utf8')) } catch { continue }
      for (const [command, count] of Object.entries(datos.commands || {})) {
        todos.set(command, (todos.get(command) || 0) + (Number(count) || 0))
      }
      if (Array.isArray(datos.recent)) recientesGlobales.push(...datos.recent)
    }
  } catch {}
  recientesGlobales.sort((a, b) => Number(b.at) - Number(a.at))
  return {
    activeGroups: gruposActivos(),
    totalCommands: totalComandosDisponibles(),
    topCommands: Array.isArray(previewTop) ? previewTop : [...todos.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([command, count]) => ({ command, count })),
    recentCommands: Array.isArray(previewRecent) ? previewRecent : recientesGlobales.slice(0, MAX_RECIENTES),
  }
}
