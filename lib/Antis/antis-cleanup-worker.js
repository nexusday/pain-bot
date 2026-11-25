/**
 * Limpieza de anti-delete en un hilo aparte.
 *
 * Antes esta tarea se ejecutaba en el event loop del bot y con 176 subbots
 * tardaba 14 s: todos los comandos se quedaban esperando. Aquí el trabajo de
 * disco ocurre en un worker; el bot solo recibe un resumen.
 */
import { parentPort, workerData } from 'node:worker_threads'
import fs from 'node:fs/promises'
import { join } from 'node:path'

const {
  dir,
  ttlMs = 10 * 60_000,
  intervalMs = 60_000,
  maxMediaBytes = 512 * 1024 * 1024,
} = workerData || {}
let limpiando = false

async function borrarEntrada(carpeta, id, mediaFile) {
  const rutas = [join(carpeta, `${id}.json`)]
  if (mediaFile) rutas.push(join(carpeta, mediaFile))
  await Promise.all(rutas.map((ruta) => fs.unlink(ruta).catch((error) => {
    if (error?.code !== 'ENOENT') throw error
  })))
}

async function limpiar() {
  if (limpiando || !dir) return
  limpiando = true
  const inicio = Date.now()
  let borrados = 0
  const medios = []
  let bytesMedios = 0
  try {
    const carpetas = await fs.readdir(dir, { withFileTypes: true }).catch((error) => {
      if (error?.code === 'ENOENT') return []
      throw error
    })
    for (const entrada of carpetas) {
      if (!entrada.isDirectory()) continue
      const carpeta = join(dir, entrada.name)
      const archivos = await fs.readdir(carpeta, { withFileTypes: true }).catch(() => [])
      for (const archivo of archivos) {
        if (!archivo.isFile()) continue
        if (!archivo.name.endsWith('.json')) {
          // Media de anti-delete: se contabiliza para el tope global.
          try {
            const info = await fs.stat(join(carpeta, archivo.name))
            bytesMedios += info.size
            medios.push({ ruta: join(carpeta, archivo.name), size: info.size, at: info.mtimeMs })
          } catch {}
          continue
        }
        const ruta = join(carpeta, archivo.name)
        const id = archivo.name.replace(/\.json$/, '')
        try {
          const datos = JSON.parse(await fs.readFile(ruta, 'utf8'))
          if (!datos?.at || Date.now() - datos.at > ttlMs) {
            await borrarEntrada(carpeta, id, datos?.mediaFile)
            borrados++
          }
        } catch (error) {
          if (error?.code === 'ENOENT') continue
          if (error instanceof SyntaxError) {
            await fs.unlink(ruta).catch(() => {})
            borrados++
          }
        }
      }
      await fs.readdir(carpeta).then((restantes) => {
        if (!restantes.length) return fs.rmdir(carpeta).catch(() => {})
      }).catch(() => {})
    }
    // Tope global de medios: si 300 subbots guardan clips, 15 GB de disco se
    // llenan. Se borran los más antiguos hasta bajar del presupuesto.
    if (bytesMedios > maxMediaBytes && medios.length) {
      medios.sort((a, b) => a.at - b.at)
      for (const medio of medios) {
        if (bytesMedios <= maxMediaBytes) break
        try {
          await fs.unlink(medio.ruta)
          bytesMedios -= medio.size
          borrados++
        } catch {}
      }
    }
  } catch {
    // La limpieza nunca debe tumbar el worker.
  } finally {
    limpiando = false
    parentPort?.postMessage({ ms: Date.now() - inicio, borrados, bytesMedios })
  }
}

const temporizador = setInterval(limpiar, Math.max(30_000, Number(intervalMs) || 60_000))
limpiar()
