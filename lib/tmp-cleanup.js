import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const TMP_PROYECTO = join(__dirname, '../tmp')
/** @deprecated usar TMP_PROYECTO */
export const PROJECT_TMP = TMP_PROYECTO

// 30 min: una conversión de sticker puede esperar en cola más de 3 min.
// Con 3 min el limpiador borraba el .mp4 temporal antes de que FFmpeg lo
// abriera ("No such file or directory").
const EDAD_MAXIMA_MS_DEFECTO = 30 * 60 * 1000
const INTERVALO_MS_DEFECTO = 45 * 1000

export function iniciarTmpProyecto() {
  if (!existsSync(TMP_PROYECTO)) {
    mkdirSync(TMP_PROYECTO, { recursive: true })
  }
  process.env.TMPDIR = TMP_PROYECTO
  process.env.TEMP = TMP_PROYECTO
  process.env.TMP = TMP_PROYECTO
  return TMP_PROYECTO
}

let limpiandoTmp = false

export function obtenerDirsTmp() {
  return [TMP_PROYECTO]
}

function cederHilo() {
  return new Promise((resolve) => setImmediate(resolve))
}

export async function limpiarArchivosTmp(opciones = {}) {
  if (limpiandoTmp) return 0
  limpiandoTmp = true
  const edadMaximaMs = opciones.maxAgeMs ?? EDAD_MAXIMA_MS_DEFECTO
  const carpetas = opciones.dirs ?? obtenerDirsTmp()
  const ahora = Date.now()
  let eliminados = 0
  let vistos = 0

  try {
    for (const carpeta of carpetas) {
      if (!existsSync(carpeta)) continue

      let entradas = []
      try {
        entradas = readdirSync(carpeta)
      } catch {
        continue
      }

      for (const entrada of entradas) {
        vistos++
        if (vistos % 30 === 0) await cederHilo()
        const rutaArchivo = join(carpeta, entrada)
        try {
          const stats = statSync(rutaArchivo)
          if (!stats.isFile()) continue
          if (ahora - stats.mtimeMs < edadMaximaMs) continue
          unlinkSync(rutaArchivo)
          eliminados++
        } catch {}
      }
    }
  } finally {
    limpiandoTmp = false
  }

  return eliminados
}

export function iniciarIntervaloLimpiezaTmp(opciones = {}) {
  const intervaloMs = opciones.intervalMs ?? INTERVALO_MS_DEFECTO
  const edadMaximaMs = opciones.maxAgeMs ?? EDAD_MAXIMA_MS_DEFECTO
  const verbose = opciones.verbose ?? false

  const temporizador = setInterval(() => {
    const inicio = Date.now()
    limpiarArchivosTmp({ maxAgeMs: edadMaximaMs }).then((eliminados) => {
      const demora = Date.now() - inicio
      if (demora > 500) console.warn(`[TMP] limpieza lenta: ${demora} ms (${eliminados} archivos)`)
      else if (verbose && eliminados > 0) {
        console.log(`[TMP] ${eliminados} archivo(s) temporal(es) eliminado(s).`)
      }
    }).catch(() => {})
  }, intervaloMs)
  temporizador.unref?.()
  return temporizador
}

export {
  iniciarTmpProyecto as initProjectTmp,
  obtenerDirsTmp as getTmpDirs,
  limpiarArchivosTmp as cleanupTmpFiles,
  iniciarIntervaloLimpiezaTmp as startTmpCleanupInterval
}

iniciarTmpProyecto()
