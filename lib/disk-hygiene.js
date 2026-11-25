/**
 * Higiene de disco del proceso único.
 *
 * Con 300 subbots y anti-delete multimedia, 15 GB se llenan. Aquí se podan
 * logs viejos, snapshots de estado de versiones anteriores y se avisa cuando
 * el disco baja del umbral. Todo es asíncrono y con presupuesto: nunca bloquea
 * el camino de los mensajes.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

const RAIZ = process.cwd()
const CARPETA_LOGS = path.join(RAIZ, 'storage', 'logs')
const CARPETA_CRASH = path.join(CARPETA_LOGS, 'crash')
const CARPETA_STATUS = path.join(RAIZ, 'storage', 'process-status')
const DIAS_LOGS = Math.max(1, Number.parseInt(process.env.PAIN_LOG_RETENTION_DAYS, 10) || 7)
const INTERVALO_MS = Math.max(
  5 * 60_000,
  Number.parseInt(process.env.PAIN_DISK_HYGIENE_MS, 10) || 30 * 60_000
)
const UMBRAL_LIBRE = Number.parseFloat(process.env.PAIN_DISK_FREE_PERCENT || '10')

let ultimoAviso = 0

async function listarArchivos(carpeta) {
  try {
    return await fs.readdir(carpeta, { withFileTypes: true })
  } catch {
    return []
  }
}

async function limpiarLogsAntiguos() {
  const limite = Date.now() - DIAS_LOGS * 24 * 60 * 60 * 1000
  let borrados = 0
  for (const carpeta of [CARPETA_CRASH, CARPETA_LOGS]) {
    for (const entrada of await listarArchivos(carpeta)) {
      if (!entrada.isFile()) continue
      const ruta = path.join(carpeta, entrada.name)
      try {
        const info = await fs.stat(ruta)
        if (info.mtimeMs < limite) {
          await fs.unlink(ruta)
          borrados++
        }
      } catch {}
    }
  }
  return borrados
}

/** Snapshots de estado de la etapa multiproceso: ya no se leen. */
async function limpiarStatusAntiguo() {
  const limite = Date.now() - 60 * 60 * 1000
  let borrados = 0
  for (const entrada of await listarArchivos(CARPETA_STATUS)) {
    if (!entrada.isFile() || !entrada.name.endsWith('.json')) continue
    if (entrada.name === 'primary.json') continue
    const ruta = path.join(CARPETA_STATUS, entrada.name)
    try {
      const info = await fs.stat(ruta)
      if (info.mtimeMs < limite) {
        await fs.unlink(ruta)
        borrados++
      }
    } catch {}
  }
  return borrados
}

async function estadoDisco() {
  try {
    const datos = await fs.statfs(RAIZ)
    const total = Number(datos.blocks) * Number(datos.bsize)
    const libre = Number(datos.bavail) * Number(datos.bsize)
    if (!total || !libre) return null
    return { total, libre, porcentaje: (libre / total) * 100 }
  } catch {
    return null
  }
}

export async function estadoDiscoProceso() {
  const disco = await estadoDisco()
  if (!disco) return null
  return {
    totalMB: mb(disco.total),
    libreMB: mb(disco.libre),
    porcentajeLibre: Math.round(disco.porcentaje * 10) / 10,
  }
}

function mb(bytes) {
  return Math.round((Number(bytes) || 0) / 1048576)
}

export async function ejecutarHigieneDisco({ verbose = false } = {}) {
  const inicio = Date.now()
  const [logs, status, disco] = await Promise.all([
    limpiarLogsAntiguos().catch(() => 0),
    limpiarStatusAntiguo().catch(() => 0),
    estadoDisco(),
  ])
  const resumen = { logs, status, disco, ms: 0 }
  if (disco && disco.porcentaje < UMBRAL_LIBRE) {
    const ahora = Date.now()
    if (verbose || ahora - ultimoAviso >= 60 * 60 * 1000) {
      ultimoAviso = ahora
      console.warn(
        `[disco] Solo quedan ${mb(disco.libre)} MB libres de ${mb(disco.total)} MB ` +
        `(${disco.porcentaje.toFixed(1)}%). Revisa storage/msgdels y storage/logs.`
      )
    }
  }
  resumen.ms = Date.now() - inicio
  if (verbose && (logs || status)) {
    console.log(`[disco] ${logs} log(s) y ${status} estado(s) antiguos eliminados.`)
  }
  return resumen
}

export function startDiskHygiene() {
  let temporizador = null
  const ejecutar = () => {
    ejecutarHigieneDisco().catch(() => {})
  }
  const primero = setTimeout(ejecutar, 60_000)
  primero.unref?.()
  temporizador = setInterval(ejecutar, INTERVALO_MS)
  temporizador.unref?.()
  return () => {
    clearTimeout(primero)
    clearInterval(temporizador)
  }
}
