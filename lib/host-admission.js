/**
 * Admisión compartida entre procesos del bot.
 *
 * Cada worker tiene su propia memoria, así que una cola JavaScript local no
 * evita una tormenta global. Los slots se representan con archivos creados
 * mediante `wx`: esa creación es atómica y funciona entre procesos del mismo
 * host.
 *
 * Esto limita operaciones simultáneas (handshakes o consultas pesadas), no la
 * cantidad total de sub-bots conectados.
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const HOST = os.hostname()
const ESPERA_COLA_MS = 250
const MAX_SLOTS = 8
const TTL_POR_DEFECTO_MS = 120_000
// Un permiso no puede vivir más que esto ni aunque su proceso siga vivo. Es la
// red de seguridad contra sockets abandonados que dejaban la cola bloqueada.
const MAX_TTL_MS = 300_000
const RESUMEN_MS = 30_000
// Contadores para diagnosticar tapones: cuántos permisos hay activos y cuántas
// sesiones están esperando. Se imprime solo si hay gente esperando.
const contadores = new Map()

function estadoContadores(nombre) {
  let estado = contadores.get(nombre)
  if (!estado) {
    estado = { activos: 0, esperando: 0, ultimoAviso: 0 }
    contadores.set(nombre, estado)
  }
  return estado
}

const resumenAdmision = setInterval(() => {
  const ahora = Date.now()
  for (const [nombre, estado] of contadores) {
    if (estado.esperando <= 0) continue
    if (ahora - estado.ultimoAviso < RESUMEN_MS) continue
    estado.ultimoAviso = ahora
    console.error(
      `[admision] ${nombre}: activos=${estado.activos} esperando=${estado.esperando}`
    )
  }
}, RESUMEN_MS)
resumenAdmision.unref?.()

function entero(valor, defecto, minimo, maximo) {
  const n = Number.parseInt(valor, 10)
  if (!Number.isInteger(n)) return defecto
  return Math.min(Math.max(n, minimo), maximo)
}

function nombreSeguro(valor) {
  const nombre = String(valor || '').replace(/[^a-zA-Z0-9_-]/g, '_')
  return nombre || 'default'
}

function leerJson(ruta) {
  try {
    return JSON.parse(fs.readFileSync(ruta, 'utf8'))
  } catch {
    return null
  }
}

function pidVivo(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM significa que el proceso existe pero no tenemos permiso para
    // inspeccionarlo. Solo ESRCH confirma que ya murió.
    return error?.code !== 'ESRCH'
  }
}

function raizAdmisiones(rootDir) {
  return path.join(
    path.resolve(rootDir || path.resolve(process.cwd(), 'storage')),
    'runtime-admission'
  )
}

function edadMs(ruta, info) {
  let mtime = 0
  try {
    mtime = fs.statSync(ruta).mtimeMs
  } catch {
    return Infinity
  }
  const creado = Number(info?.startedAt)
  if (Number.isFinite(creado) && creado > 0) return Math.max(0, Date.now() - creado)
  return Math.max(0, Date.now() - mtime)
}

function estaCaducado(ruta, info, ttlMs) {
  // La edad manda SIEMPRE, aunque el proceso siga vivo. Antes se descartaba el
  // TTL cuando el PID existía: un socket abandonado (reconexión solapada)
  // dejaba su permiso ocupado para siempre y bloqueaba todas las conexiones.
  return edadMs(ruta, info) > ttlMs
}

function limpiarSlotsCaducados(directorio, ttlMs, nombre) {
  let nombres = []
  try {
    nombres = fs.readdirSync(directorio)
  } catch {
    return
  }

  for (const archivo of nombres) {
    if (!/^slot-\d+\.lock$/.test(archivo)) continue
    const ruta = path.join(directorio, archivo)
    const info = leerJson(ruta)
    if (!estaCaducado(ruta, info, ttlMs)) continue
    const segundos = Math.round(edadMs(ruta, info) / 1000)
    try { fs.unlinkSync(ruta) } catch { continue }
    const vivo = info ? pidVivo(Number(info.pid)) : false
    console.error(
      `[admision] ${nombre}: permiso caducado ` +
      `(PID ${info?.pid ?? 'desconocido'}${vivo ? ', proceso vivo' : ''}, ${segundos}s)`
    )
  }
}

async function esperar(ms, cancelado) {
  let restante = Math.max(0, Number(ms) || 0)
  while (restante > 0) {
    if (cancelado()) return false
    const pausa = Math.min(restante, ESPERA_COLA_MS)
    await new Promise((resolve) => setTimeout(resolve, pausa))
    restante -= pausa
  }
  return !cancelado()
}

/**
 * Espera un slot y devuelve una función idempotente para liberarlo.
 */
export async function adquirirPermisoCompartido(
  nombre,
  {
    rootDir = path.resolve(process.cwd(), 'storage'),
    slots = 1,
    ttlMs = TTL_POR_DEFECTO_MS,
    cancelado = () => false,
  } = {}
) {
  const cantidad = entero(slots, 1, 1, MAX_SLOTS)
  const ttl = Math.min(
    Math.max(10_000, Number(ttlMs) || TTL_POR_DEFECTO_MS),
    MAX_TTL_MS
  )
  const clave = nombreSeguro(nombre)
  const estado = estadoContadores(clave)
  const directorio = path.join(raizAdmisiones(rootDir), clave)
  fs.mkdirSync(directorio, { recursive: true })

  estado.esperando++
  let enEspera = true
  const dejarDeEsperar = () => {
    if (!enEspera) return
    enEspera = false
    estado.esperando = Math.max(0, estado.esperando - 1)
  }

  try {
    while (!cancelado()) {
      limpiarSlotsCaducados(directorio, ttl, clave)

      for (let indice = 0; indice < cantidad; indice++) {
        const ruta = path.join(directorio, `slot-${indice}.lock`)
        const token = crypto.randomUUID()
        const datos = {
          token,
          pid: process.pid,
          host: HOST,
          startedAt: Date.now(),
        }

        try {
          fs.writeFileSync(ruta, JSON.stringify(datos), {
            flag: 'wx',
            mode: 0o600,
          })
        } catch (error) {
          if (error?.code === 'EEXIST') continue
          throw error
        }

        dejarDeEsperar()
        estado.activos++

        let liberado = false
        const liberar = () => {
          if (liberado) return
          liberado = true
          estado.activos = Math.max(0, estado.activos - 1)
          try {
            const actual = leerJson(ruta)
            // Nunca borra el permiso de otro proceso si el slot fue reciclado.
            if (actual?.token === token) fs.unlinkSync(ruta)
          } catch {}
        }
        const alSalir = () => liberar()
        process.once('exit', alSalir)

        return () => {
          process.off('exit', alSalir)
          liberar()
        }
      }

      const continuo = await esperar(ESPERA_COLA_MS, cancelado)
      if (!continuo) return null
    }

    return null
  } finally {
    // Cubre todas las salidas (cancelación, error o éxito).
    dejarDeEsperar()
  }
}

/**
 * Ejecuta una operación con un intervalo mínimo global entre comienzos.
 *
 * El estado de la última ejecución se guarda dentro del mismo directorio que
 * los slots. Así los workers comparten el rate limit incluso siendo procesos
 * distintos.
 */
export async function ejecutarConRateLimitCompartido(
  nombre,
  trabajo,
  {
    rootDir = path.resolve(process.cwd(), 'storage'),
    intervalMs = 0,
    ttlMs = TTL_POR_DEFECTO_MS,
    cancelado = () => false,
  } = {}
) {
  const liberar = await adquirirPermisoCompartido(nombre, {
    rootDir,
    slots: 1,
    ttlMs,
    cancelado,
  })
  if (!liberar) return null

  const directorio = path.join(raizAdmisiones(rootDir), nombreSeguro(nombre))
  const rutaEstado = path.join(directorio, 'rate.json')

  try {
    const intervalo = Math.max(0, Number(intervalMs) || 0)
    const estado = leerJson(rutaEstado)
    const ultimo = Number(estado?.lastAt) || 0
    const falta = ultimo + intervalo - Date.now()
    if (falta > 0 && !(await esperar(falta, cancelado))) return null
    if (cancelado()) return null

    // Se marca antes de iniciar la consulta: si tarda, la siguiente operación
    // espera el intervalo completo desde su comienzo y no genera una ráfaga.
    fs.writeFileSync(
      rutaEstado,
      JSON.stringify({ lastAt: Date.now(), pid: process.pid, host: HOST }),
      { mode: 0o600 }
    )
    return await trabajo()
  } finally {
    liberar()
  }
}
