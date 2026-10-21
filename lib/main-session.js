import fs from 'node:fs'
import path from 'node:path'

/**
 * Credenciales del bot principal (no de los sub-bots).
 * El principal usa `useMultiFileAuthState(global.authFile)`, normalmente la
 * carpeta `sessions/`. Aquí solo se leen y borran esos archivos: la sesión
 * real sigue siendo responsabilidad de Baileys.
 */

export function rutaCredencialesPrincipales() {
  return path.resolve(process.cwd(), global.authFile || 'sessions')
}

export function leerCredencialesPrincipales() {
  try {
    const archivo = path.join(rutaCredencialesPrincipales(), 'creds.json')
    if (!fs.existsSync(archivo)) return null
    return JSON.parse(fs.readFileSync(archivo, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Borra los archivos de autenticación del principal (creds, pre-keys,
 * sesiones y app-state). Deja la carpeta lista para un emparejamiento nuevo.
 */
export function borrarCredencialesPrincipales() {
  const dir = rutaCredencialesPrincipales()
  const borrados = []
  let entradas = []
  try {
    entradas = fs.readdirSync(dir)
  } catch {
    return borrados
  }
  for (const nombre of entradas) {
    if (!nombre.endsWith('.json')) continue
    try {
      fs.rmSync(path.join(dir, nombre), { force: true })
      borrados.push(nombre)
    } catch {}
  }
  return borrados
}
