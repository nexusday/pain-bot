console.log('⧉ Inicializando Pain...')

import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import cluster from 'node:cluster'

const __dirname = dirname(fileURLToPath(import.meta.url))
const { setupMaster, fork } = cluster
const REINICIO_GRACIOSO_MS = 1000
const REINICIO_FORZADO_MS = 10_000
const REINICIO_MAX_MS = 30_000
const TIEMPO_ESTABLE_MS = 60_000

let workerActual = null
let temporizadorReinicio = null
let temporizadorForzado = null
let reinicioSolicitado = false
let apagando = false
let fallosConsecutivos = 0

try {
  const { default: cfonts } = await import('cfonts')
  cfonts.say('PAIN\nBOT', {
    font: 'block',
    align: 'center',
    gradient: ['cyan', 'blue']
  })
  cfonts.say('WhatsApp Multi-Bot-Official', {
    font: 'simple',
    align: 'center',
    gradient: ['blue', 'white']
  })
} catch {
  console.log('PAIN BOT')
}

setupMaster({
  exec: join(__dirname, 'main.js'),
  args: process.argv.slice(2),
})

function iniciarWorker() {
  if (apagando || workerActual) return

  const iniciadoEn = Date.now()
  const worker = fork()
  workerActual = worker

  worker.on('message', (mensaje) => {
    if (worker !== workerActual) return

    if (mensaje === 'uptime') {
      worker.send(process.uptime())
      return
    }

    if (mensaje !== 'reset' && mensaje !== 'restart') return

    reinicioSolicitado = true
    console.warn('Worker solicitó reinicio; reiniciando el proceso del bot...')
    worker.kill('SIGTERM')
    temporizadorForzado = setTimeout(() => {
      if (worker === workerActual && !worker.isDead()) worker.kill('SIGKILL')
    }, REINICIO_FORZADO_MS)
  })

  worker.on('error', (error) => {
    console.error('Error del worker principal:', error)
  })

  worker.on('exit', (code, signal) => {
    if (worker !== workerActual) return
    workerActual = null
    if (temporizadorForzado) clearTimeout(temporizadorForzado)
    temporizadorForzado = null

    if (apagando) {
      process.exit(0)
      return
    }

    const duracion = Date.now() - iniciadoEn
    if (duracion >= TIEMPO_ESTABLE_MS) fallosConsecutivos = 0

    const demora = reinicioSolicitado
      ? REINICIO_GRACIOSO_MS
      : Math.min(1000 * (2 ** fallosConsecutivos++), REINICIO_MAX_MS)
    reinicioSolicitado = false

    console.error(
      `Worker terminó (código ${code ?? 'desconocido'}, señal ${signal || 'ninguna'}). ` +
      `Nuevo intento en ${demora / 1000}s.`
    )
    temporizadorReinicio = setTimeout(iniciarWorker, demora)
  })
}

function apagar(signal) {
  if (apagando) return
  apagando = true
  if (temporizadorReinicio) clearTimeout(temporizadorReinicio)

  const worker = workerActual
  if (!worker || worker.isDead()) {
    process.exit(0)
    return
  }

  worker.once('exit', () => process.exit(0))
  worker.kill(signal)
  temporizadorForzado = setTimeout(() => {
    if (!worker.isDead()) worker.kill('SIGKILL')
    process.exit(1)
  }, REINICIO_FORZADO_MS)
}

process.once('SIGINT', () => apagar('SIGINT'))
process.once('SIGTERM', () => apagar('SIGTERM'))

iniciarWorker()
