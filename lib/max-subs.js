import fs from 'fs'
import path from 'path'
import { join } from 'path'

const MIN_MAX = 0

function rutaMaxSubs() {
  return join(process.cwd(), 'storage', 'maxsubs.json')
}

function raizSerbot() {
  return join(process.cwd(), global.bot || 'Serbot')
}

function parsearValorMax(crudo) {
  const max = Math.floor(Number(crudo))
  if (!Number.isFinite(max) || max < MIN_MAX) return 0
  return max
}

function asegurarArchivoMaxSubs() {
  const archivo = rutaMaxSubs()
  const carpeta = path.dirname(archivo)
  if (!fs.existsSync(carpeta)) fs.mkdirSync(carpeta, { recursive: true })

  if (!fs.existsSync(archivo)) return 0

  try {
    const data = JSON.parse(fs.readFileSync(archivo, 'utf-8'))
    return parsearValorMax(data?.max)
  } catch {
    return 0
  }
}

export function esIlimitadoSubBots(max = obtenerMaxSubs()) {
  return !max || max <= 0
}

export function obtenerMaxSubs() {
  return asegurarArchivoMaxSubs()
}

export function establecerMaxSubs(valor) {
  const max = parsearValorMax(valor)
  if (!Number.isFinite(max) || max < MIN_MAX) {
    throw new Error('El máximo debe ser 0 (ilimitado) o un número mayor a 0.')
  }

  const archivo = rutaMaxSubs()
  const carpeta = path.dirname(archivo)
  if (!fs.existsSync(carpeta)) fs.mkdirSync(carpeta, { recursive: true })

  fs.writeFileSync(archivo, JSON.stringify({ max }, null, 2))
  return max
}

/** Sub-bots registrados (carpeta Serbot con creds.json). No borra nada. */
export function listarSubBotsRegistrados() {
  const raiz = raizSerbot()
  if (!fs.existsSync(raiz)) return []

  return fs.readdirSync(raiz).filter(carpeta => {
    const rutaCarpeta = join(raiz, carpeta)
    try {
      return (
        fs.statSync(rutaCarpeta).isDirectory() &&
        fs.existsSync(join(rutaCarpeta, 'creds.json'))
      )
    } catch {
      return false
    }
  })
}

export function contarSubBotsRegistrados() {
  return listarSubBotsRegistrados().length
}

export function contarSubBotsConectados(moduloWs) {
  const CERRADO = moduloWs?.CLOSED ?? 3
  if (!Array.isArray(global.conns)) return 0

  const activos = global.conns.filter(
    conn => conn?.user && conn?.ws?.socket && conn.ws.socket.readyState !== CERRADO
  )
  return [...new Set(activos)].length
}

/** true = puede vincular (nuevo o reconexión del mismo número). */
export function puedeRegistrarSubBot(numeroTelefono) {
  const id = String(numeroTelefono || '').replace(/\D/g, '')
  if (!id) return { ok: false, reason: 'invalid' }

  const raiz = join(raizSerbot(), id)
  const yaExiste = fs.existsSync(join(raiz, 'creds.json'))
  const registrados = contarSubBotsRegistrados()
  const max = obtenerMaxSubs()

  if (yaExiste) {
    return { ok: true, reconnect: true, registered: registrados, max, unlimited: esIlimitadoSubBots(max) }
  }

  if (esIlimitadoSubBots(max)) {
    return { ok: true, reconnect: false, registered: registrados, max, unlimited: true }
  }

  if (registrados >= max) {
    return { ok: false, reconnect: false, registered: registrados, max, unlimited: false }
  }

  return { ok: true, reconnect: false, registered: registrados, max, unlimited: false }
}

export function obtenerInfoSlotsSubBot(moduloWs) {
  const max = obtenerMaxSubs()
  const ilimitado = esIlimitadoSubBots(max)
  const registrados = contarSubBotsRegistrados()
  const conectados = contarSubBotsConectados(moduloWs)
  const disponibles = ilimitado ? null : Math.max(0, max - registrados)

  return {
    max,
    unlimited: ilimitado,
    registered: registrados,
    connected: conectados,
    available: disponibles,
    list: listarSubBotsRegistrados()
  }
}

export {
  esIlimitadoSubBots as isUnlimitedSubBots,
  obtenerMaxSubs as getMaxSubs,
  establecerMaxSubs as setMaxSubs,
  listarSubBotsRegistrados as listRegisteredSubBots,
  contarSubBotsRegistrados as countRegisteredSubBots,
  contarSubBotsConectados as countConnectedSubBots,
  puedeRegistrarSubBot as canRegisterSubBot,
  obtenerInfoSlotsSubBot as getSubBotSlotsInfo
}
