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
let fallosFatales = 0
let primerFalloFatal = 0
const VENTANA_FALLOS_MS = 60_000
const MAX_FALLOS_VENTANA = 5
// Un error de un plugin no debe tumbar las 300 sesiones. Solo se reinicia el
// proceso si los fallos se repiten (estado corrupto) u el operador lo fuerza.
const SALIR_SIEMPRE = process.env.PAIN_EXIT_ON_UNCAUGHT === '1'
let ultimoLogCrash = 0

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
  const ahora = Date.now()
  if (!primerFalloFatal || ahora - primerFalloFatal > VENTANA_FALLOS_MS) {
    primerFalloFatal = ahora
    fallosFatales = 0
  }
  fallosFatales++
  let archivo = null
  if (ahora - ultimoLogCrash >= 10_000) {
    ultimoLogCrash = ahora
    archivo = guardar('uncaughtException', error)
  }
  console.error(
    `[crash] Excepción no capturada (${process.env.PAIN_ROLE || 'primary'}); ` +
    `el proceso sigue (${fallosFatales}/${MAX_FALLOS_VENTANA} en 60s):`,
    error?.stack || error
  )
  if (archivo) console.error(`[crash] Detalle guardado en ${archivo}`)
  if (SALIR_SIEMPRE || fallosFatales >= MAX_FALLOS_VENTANA) {
    console.error('[crash] Fallos repetidos: se reinicia el proceso para evitar un estado corrupto.')
    process.exit(1)
  }
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
