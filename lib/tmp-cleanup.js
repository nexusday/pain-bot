import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const TMP_PROYECTO = join(__dirname, '../tmp')
/** @deprecated usar TMP_PROYECTO */
export const PROJECT_TMP = TMP_PROYECTO

const EDAD_MAXIMA_MS_DEFECTO = 3 * 60 * 1000
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

export function obtenerDirsTmp() {
  const carpetas = new Set([TMP_PROYECTO])
  const tmpSistema = tmpdir()
  if (tmpSistema) carpetas.add(tmpSistema)
  return [...carpetas]
}

export function limpiarArchivosTmp(opciones = {}) {
  const edadMaximaMs = opciones.maxAgeMs ?? EDAD_MAXIMA_MS_DEFECTO
  const carpetas = opciones.dirs ?? obtenerDirsTmp()
  const ahora = Date.now()
  let eliminados = 0

  for (const carpeta of carpetas) {
    if (!existsSync(carpeta)) continue

    let entradas = []
    try {
      entradas = readdirSync(carpeta)
    } catch {
      continue
    }

    for (const entrada of entradas) {
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

  return eliminados
}

export function iniciarIntervaloLimpiezaTmp(opciones = {}) {
  const intervaloMs = opciones.intervalMs ?? INTERVALO_MS_DEFECTO
  const edadMaximaMs = opciones.maxAgeMs ?? EDAD_MAXIMA_MS_DEFECTO
  const verbose = opciones.verbose ?? false

  return setInterval(() => {
    const eliminados = limpiarArchivosTmp({ maxAgeMs: edadMaximaMs })
    if (verbose && eliminados > 0) {
      console.log(`[TMP] ${eliminados} archivo(s) temporal(es) eliminado(s).`)
    }
  }, intervaloMs)
}

export {
  iniciarTmpProyecto as initProjectTmp,
  obtenerDirsTmp as getTmpDirs,
  limpiarArchivosTmp as cleanupTmpFiles,
  iniciarIntervaloLimpiezaTmp as startTmpCleanupInterval
}

iniciarTmpProyecto()
