/**
 * Registro temprano de fallos fatales.
 *
 * `main.js` instala su propio manejador de `uncaughtException` recién al final
 * del archivo. Un error durante la carga del módulo (o el arranque de la base)
 * ocurre antes y el proceso muere con código 1 sin dejar rastro útil, mientras
 * el supervisor lo reinicia una y otra vez. Este módulo se importa PRIMERO
 * para dejar el motivo en `storage/logs/crash/startup-*.log`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { esErrorDeRedBenigno, esErrorDescifradoBenigno, resumenError } from './network-errors.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(__dirname, '..')
const CARPETA_LOGS = path.join(RAIZ, 'storage', 'logs', 'crash')
// Se registra en el primer módulo que se importa para poder medir después
// cuánto tarda cada proceso en quedar listo (carga de plugins, etc.).
global.__painBootAt = Date.now()
let ultimoRechazo = 0
let ultimoDescifrado = 0

function guardar(tipo, error) {
  try {
    fs.mkdirSync(CARPETA_LOGS, { recursive: true })
    const rol = process.env.PAIN_ROLE || 'primary'
    const destino = path.join(CARPETA_LOGS, `startup-${rol}.log`)
    const detalle = error?.stack || error?.message || String(error)
    fs.appendFileSync(
      destino,
      `${new Date().toISOString()} [${rol}] ${tipo}\n${detalle}\n\n`,
      'utf8'
    )
    return destino
  } catch {
    return null
  }
}

process.on('uncaughtException', (error) => {
  if (esErrorDeRedBenigno(error)) {
    console.error(`[net] error de red ignorado (el bot sigue vivo): ${resumenError(error)}`)
    return
  }
  if (esErrorDescifradoBenigno(error)) {
    const ahora = Date.now()
    if (ahora - ultimoDescifrado >= 60_000) {
      ultimoDescifrado = ahora
      console.warn(`[baileys] descifrado fallido (transitorio): ${resumenError(error)}`)
    }
    return
  }
  const archivo = guardar('uncaughtException', error)
  console.error(
    `[crash] Excepción no capturada (${process.env.PAIN_ROLE || 'primary'}):`,
    error?.stack || error
  )
  if (archivo) console.error(`[crash] Detalle guardado en ${archivo}`)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  if (esErrorDeRedBenigno(reason)) {
    console.error(`[net] rechazo de red ignorado (el bot sigue vivo): ${resumenError(reason)}`)
    return
  }
  if (esErrorDescifradoBenigno(reason)) {
    const ahora = Date.now()
    if (ahora - ultimoDescifrado >= 60_000) {
      ultimoDescifrado = ahora
      console.warn(`[baileys] descifrado fallido (transitorio): ${resumenError(reason)}`)
    }
    return
  }
  const ahora = Date.now()
  if (ahora - ultimoRechazo < 5000) return
  ultimoRechazo = ahora
  const archivo = guardar('unhandledRejection', reason)
  console.error(
    `[crash] Promesa rechazada sin manejar (${process.env.PAIN_ROLE || 'primary'}); se ignora para no tumbar todos los sub-bots:`,
    reason?.stack || reason
  )
  if (archivo) console.error(`[crash] Detalle guardado en ${archivo}`)
})
