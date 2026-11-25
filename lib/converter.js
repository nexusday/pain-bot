import { promises } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'

// FFmpeg usa todos los núcleos por defecto. En un VPS con varios workers eso
// satura la CPU y deja sin tiempo al event loop (los sub-bots "tardan" en
// responder). La cola es por proceso y configurable: no limita cuántos
// sub-bots puede haber, solo cuántas conversiones pesadas corren a la vez.
const MAX_CONVERSIONES = Math.min(
  Math.max(Number.parseInt(process.env.PAIN_FFMPEG_CONCURRENCY, 10) || 1, 1),
  8
)
const MAX_COLA_CONVERSIONES = Math.min(
  Math.max(Number.parseInt(process.env.PAIN_FFMPEG_QUEUE, 10) || 16, 1),
  64
)
const TIMEOUT_CONVERSION_MS = Math.max(
  Number.parseInt(process.env.PAIN_FFMPEG_TIMEOUT_MS, 10) || 120_000,
  10_000
)

let conversionesActivas = 0
const colaConversiones = []

/**
 * Ejecuta un trabajo FFmpeg respetando el cupo del proceso.
 * Si la cola se llena se rechaza en vez de acumular búferes en memoria.
 */
export function conLimiteFfmpeg(trabajo) {
  return new Promise((resolve, reject) => {
    const ejecutar = () => {
      conversionesActivas++
      Promise.resolve()
        .then(trabajo)
        .then(resolve, reject)
        .finally(() => {
          conversionesActivas--
          const siguiente = colaConversiones.shift()
          if (siguiente) siguiente()
        })
    }

    if (conversionesActivas < MAX_CONVERSIONES) ejecutar()
    else if (colaConversiones.length < MAX_COLA_CONVERSIONES) colaConversiones.push(ejecutar)
    else reject(new Error('Hay muchas conversiones en curso. Intenta de nuevo en unos segundos.'))
  })
}

function ffmpeg(buffer, args = [], ext = '', ext2 = '') {
  return conLimiteFfmpeg(() => new Promise(async (resolve, reject) => {
    const directorio = join(global.__dirname(import.meta.url), '../tmp')
    const sello = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const tmp = join(directorio, `${sello}.${ext}`)
    const out = `${tmp}.${ext2}`
    let proceso = null
    let temporizador = null
    let terminado = false

    const limpiar = async () => {
      await promises.unlink(tmp).catch(() => {})
      await promises.unlink(out).catch(() => {})
    }

    const fallar = async (error) => {
      if (terminado) return
      terminado = true
      await limpiar()
      reject(error)
    }

    try {
      await promises.mkdir(directorio, { recursive: true })
      await promises.writeFile(tmp, buffer)

      proceso = spawn('ffmpeg', [
        '-y',
        '-hide_banner',
        '-loglevel', 'error',
        // Un solo hilo de decodificación/codificación: el paralelismo se
        // consigue con la cola de arriba, no acaparando todos los núcleos.
        '-threads', '1',
        '-filter_threads', '1',
        '-i', tmp,
        ...args,
        '-threads', '1',
        out
      ], { windowsHide: true })

      temporizador = setTimeout(() => {
        try { proceso.kill('SIGKILL') } catch {}
      }, TIMEOUT_CONVERSION_MS)
      temporizador.unref?.()

      proceso.on('error', (error) => {
        clearTimeout(temporizador)
        void fallar(error)
      })

      proceso.on('close', async (code) => {
        clearTimeout(temporizador)
        if (terminado) return
        try {
          if (code !== 0) {
            await fallar(new Error(`FFmpeg terminó con código ${code}`))
            return
          }
          terminado = true
          resolve({
            data: await promises.readFile(out),
            filename: out,
            delete() {
              return promises.unlink(out)
            }
          })
        } catch (error) {
          await fallar(error)
        }
      })
    } catch (error) {
      clearTimeout(temporizador)
      await fallar(error)
    }
  }))
}

function aPTT(buffer, ext) {
  return ffmpeg(buffer, [
    '-vn',
    '-c:a', 'libopus',
    '-b:a', '128k',
    '-vbr', 'on',
  ], ext, 'ogg')
}

function aAudio(buffer, ext) {
  return ffmpeg(buffer, [
    '-vn',
    '-c:a', 'libopus',
    '-b:a', '128k',
    '-vbr', 'on',
    // 10 es el máximo de Opus y castiga la CPU sin mejora audible a 128 kbps.
    '-compression_level', '5'
  ], ext, 'opus')
}

function aVideo(buffer, ext) {
  return ffmpeg(buffer, [
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-ab', '128k',
    '-ar', '44100',
    '-crf', '32',
    // veryfast mantiene el tamaño y baja mucho el costo frente a slow.
    '-preset', 'veryfast'
  ], ext, 'mp4')
}

export {
  aAudio as toAudio,
  aPTT as toPTT,
  aVideo as toVideo,
  ffmpeg,
  aAudio,
  aPTT,
  aVideo
}
