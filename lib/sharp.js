/**
 * sharp seguro: carga nativo o, en Android/Termux, fuerza runtime wasm.
 * Los plugins importan esto en lugar de "sharp" para no tumbar el arranque.
 */
import { createRequire } from 'module'
import { pathToFileURL } from 'url'
import path from 'path'

const require = createRequire(import.meta.url)
let enCache = null
let errorCarga = null

function intentarRequerirSharp() {
  return require('sharp')
}

function intentarRutaBinarioWasm() {
  try {
    const paqueteWasm = path.dirname(require.resolve('@img/sharp-wasm32/package.json'))
    return path.join(paqueteWasm, 'lib', 'sharp-wasm32.node')
  } catch {
    return null
  }
}

/**
 * @returns {typeof import('sharp')}
 */
export function obtenerSharp() {
  if (enCache) return enCache
  if (errorCarga) throw errorCarga

  try {
    enCache = intentarRequerirSharp()
    return enCache
  } catch (primerErr) {
    const rutaWasm = intentarRutaBinarioWasm()
    if (rutaWasm) {
      process.env.SHARP_FORCE_GLOBAL_LIBVIPS = '0'
      try {
        for (const clave of Object.keys(require.cache || {})) {
          if (clave.includes(`${path.sep}sharp${path.sep}`) || clave.endsWith(`${path.sep}sharp`)) {
            delete require.cache[clave]
          }
        }
        enCache = intentarRequerirSharp()
        return enCache
      } catch {
        // continuar
      }
    }

    errorCarga = Object.assign(
      new Error(
        'sharp no está disponible en esta plataforma (android-arm64 / Termux).\n\n' +
          'Solución definitiva (una vez):\n' +
          '  cd ~/pain-bot\n' +
          '  npm install --cpu=wasm32 sharp@0.34.1 @img/sharp-wasm32@0.34.1 --no-bin-links\n' +
          '  npm start\n\n' +
          'O deja que el arranque lo instale: se ejecuta scripts/ensure-sharp.js'
      ),
      { cause: primerErr, code: 'SHARP_UNAVAILABLE' }
    )
    throw errorCarga
  }
}

/** API compatible: default export callable como sharp(...) */
function proxySharp(...args) {
  return obtenerSharp()(...args)
}

Object.defineProperty(proxySharp, 'kernel', {
  get() {
    return obtenerSharp().kernel
  }
})

Object.defineProperty(proxySharp, 'fit', {
  get() {
    return obtenerSharp().fit
  }
})

Object.defineProperty(proxySharp, 'format', {
  get() {
    return obtenerSharp().format
  }
})

Object.defineProperty(proxySharp, 'concurrency', {
  value: (...a) => obtenerSharp().concurrency(...a)
})

Object.defineProperty(proxySharp, 'cache', {
  value: (...a) => obtenerSharp().cache(...a)
})

export default proxySharp
export { obtenerSharp as getSharp, obtenerSharp as sharp }
