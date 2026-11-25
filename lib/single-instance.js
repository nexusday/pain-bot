/**
 * Candado mínimo de instancia única por rol.
 *
 * Reemplaza al sistema de leases por proceso de la etapa multiproceso. Solo
 * impide que se ejecuten dos supervisores (o dos paneles) sobre la misma
 * carpeta; no participa en la vida de las sesiones de WhatsApp.
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

  for (let intento = 0; intento < 3; intento++) {
    const anterior = leerCandado(archivo)
    if (anterior && pidVivo(anterior.pid) && Number(anterior.pid) !== process.pid) {
      throw new Error(`Ya hay otra instancia (${rol}) activa con PID ${anterior.pid}.`)
    }
    if (anterior) {
      try { fs.unlinkSync(archivo) } catch {}
    }
    try {
      const descriptor = fs.openSync(archivo, 'wx')
      fs.writeFileSync(
        descriptor,
        JSON.stringify({ pid: process.pid, rol, startedAt: new Date().toISOString() })
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
