/**
 * Candado mínimo de instancia única por rol.
 *
 * Reemplaza al sistema de leases por proceso de la etapa multiproceso. Solo
 * impide que se ejecuten dos supervisores (o dos paneles) sobre la misma
 * carpeta; no participa en la vida de las sesiones de WhatsApp.
 *
 * El candado guarda el PID, el `boot_id` del sistema y la fecha. Antes bastaba
 * con que el PID existiera: en un contenedor nuevo (o tras un reinicio del
 * hosting) el PID 130 podía pertenecer a otro proceso y el bot se negaba a
 * arrancar para siempre. Ahora se verifica que ese PID sea de verdad un Node
 * del mismo proyecto y del mismo arranque; si no, el candado es viejo y se
 * reemplaza solo.
 */
import fs from 'node:fs'
import path from 'node:path'
import { restauracionEnCurso } from './restore-lock.js'

function pidVivo(pid) {
  const numero = Number(pid)
  if (!Number.isInteger(numero) || numero <= 0) return false
  try {
    process.kill(numero, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

function leerCandado(archivo) {
  try {
    const datos = JSON.parse(fs.readFileSync(archivo, 'utf8'))
    return datos && typeof datos === 'object' ? datos : null
  } catch {
    return null
  }
}

function idArranqueSistema() {
  try {
    return fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()
  } catch {
    return ''
  }
}

function cmdlineDePid(pid) {
  if (process.platform !== 'linux') return null
  try {
    return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim()
  } catch {
    return null
  }
}

function cwdDePid(pid) {
  if (process.platform !== 'linux') return null
  try {
    return fs.readlinkSync(`/proc/${pid}/cwd`)
  } catch {
    return null
  }
}

/**
 * true solo si el candado anterior corresponde a un proceso vivo que es, con
 * certeza, otro supervisor/main del mismo proyecto y del mismo arranque.
 */
function esOtraInstanciaReal(anterior, carpeta) {
  const pid = Number(anterior?.pid)
  if (!Number.isInteger(pid) || pid <= 0) return false
  if (pid === process.pid) return false
  if (!pidVivo(pid)) return false

  // Contenedor/máquina reiniciada: los PIDs se reciclan y el candado ya no
  // representa al proceso que lo escribió.
  const arranqueActual = idArranqueSistema()
  if (arranqueActual && anterior.bootId && anterior.bootId !== arranqueActual) {
    return false
  }

  if (process.platform === 'linux') {
    const cmd = cmdlineDePid(pid)
    // Sin /proc legible no hay forma de confirmar que sea nuestro bot: se
    // trata como candado viejo en vez de dejar el servidor sin arrancar.
    if (cmd == null) return false
    if (!/(^|[\s/])node(js)?([\s/]|$)/i.test(cmd)) return false

    const raiz = path.dirname(carpeta)
    const cwd = cwdDePid(pid)
    if (cwd) {
      try {
        if (path.resolve(cwd) !== path.resolve(raiz)) return false
      } catch {
        return false
      }
    } else if (!cmd.includes('index.js') && !cmd.includes('main.js')) {
      return false
    }
    return true
  }

  // Windows/macOS: no hay /proc; se conserva la comprobación por PID.
  return true
}

/**
 * Adquiere el candado. Devuelve una función para liberarlo.
 * @param {string} storageDir
 * @param {string} rol
 */
export function acquireSingleInstance(storageDir, rol = 'supervisor') {
  const carpeta = path.resolve(storageDir)
  fs.mkdirSync(carpeta, { recursive: true })
  if (restauracionEnCurso(carpeta)) {
    throw new Error('Hay una restauración de backup en curso o interrumpida; revisa restore-recovery antes de arrancar.')
  }
  const archivo = path.join(carpeta, `${rol}.lock`)
  const bootId = idArranqueSistema()

  for (let intento = 0; intento < 3; intento++) {
    const anterior = leerCandado(archivo)
    if (anterior && esOtraInstanciaReal(anterior, carpeta)) {
      throw new Error(`Ya hay otra instancia (${rol}) activa con PID ${anterior.pid}.`)
    }
    if (anterior) {
      console.warn(
        `[lock] candado ${rol} obsoleto (PID ${anterior.pid ?? '?'}); se reemplaza por el proceso actual.`
      )
      try { fs.unlinkSync(archivo) } catch {}
    }
    try {
      const descriptor = fs.openSync(archivo, 'wx')
      fs.writeFileSync(
        descriptor,
        JSON.stringify({
          pid: process.pid,
          rol,
          bootId,
          startedAt: new Date().toISOString()
        })
      )
      fs.closeSync(descriptor)
      let liberado = false
      const liberar = () => {
        if (liberado) return
        liberado = true
        try {
          const actual = leerCandado(archivo)
          if (Number(actual?.pid) === process.pid) fs.unlinkSync(archivo)
        } catch {}
      }
      process.once('exit', liberar)
      return liberar
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
    }
  }
  throw new Error(`No se pudo adquirir el candado de ${rol}.`)
}

export { acquireSingleInstance as acquireRuntimeLease }
