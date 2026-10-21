import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Carga opcional de `.env` para desarrollo local. En Pterodactyl lo normal es
// definir las variables en Startup → Environment: las variables reales del
// proceso siempre tienen prioridad y nunca se sobreescriben desde el archivo.
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ARCHIVO_POR_DEFECTO = path.join(RAIZ, '.env')

export function parseEnv(texto) {
  const salida = {}
  const lineas = String(texto || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)

  for (const linea of lineas) {
    const limpia = linea.trim()
    if (!limpia || limpia.startsWith('#')) continue
    const sinExport = limpia.startsWith('export ') ? limpia.slice(7).trim() : limpia
    const igual = sinExport.indexOf('=')
    if (igual <= 0) continue

    const clave = sinExport.slice(0, igual).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(clave)) continue

    let valor = sinExport.slice(igual + 1).trim()
    if (valor.length >= 2 && valor.startsWith('"') && valor.endsWith('"')) {
      valor = valor.slice(1, -1)
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
    } else if (valor.length >= 2 && valor.startsWith("'") && valor.endsWith("'")) {
      valor = valor.slice(1, -1)
    } else {
      // Comentario al final de una línea sin comillas: KEY=valor # nota
      valor = valor.replace(/\s+#.*$/, '').trim()
    }
    salida[clave] = valor
  }

  return salida
}

export function cargarEnv(archivo = process.env.PAIN_ENV_FILE || ARCHIVO_POR_DEFECTO) {
  if (process.env.PAIN_SKIP_DOTENV === '1') return {}
  let variables
  try {
    if (!fs.existsSync(archivo)) return {}
    variables = parseEnv(fs.readFileSync(archivo, 'utf8'))
  } catch {
    return {}
  }

  const cargadas = {}
  for (const [clave, valor] of Object.entries(variables)) {
    if (process.env[clave] !== undefined) continue
    process.env[clave] = valor
    cargadas[clave] = valor
  }
  return cargadas
}

cargarEnv()
