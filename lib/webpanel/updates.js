import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Actualización en caliente del bot desde el panel.
 *
 * A diferencia del comando /fix (que solo hace git pull y deja que el
 * watcher de plugins recoja los cambios), aquí además:
 *  - se guardan los cambios locales del usuario para no perderlos,
 *  - se recarga el handler y los módulos de lib/ en caliente,
 *  - se recarga el panel web con el código nuevo,
 *  - y NO se reinicia el proceso (no se cae ninguna sesión de WhatsApp).
 */

/** Archivos locales que no se deben sobrescribir al actualizar. */
const PRESERVAR = [
  'storage/maxsubs.json',
  'storage/staff.json',
  'storage/main-groups.json',
  'storage/soporte.json',
]

function ejecutar(dir, cmd) {
  return execSync(cmd, { cwd: dir, encoding: 'utf-8', stdio: 'pipe' })
}

function ejecutarIgnorando(dir, cmd) {
  try {
    execSync(cmd, { cwd: dir, stdio: 'ignore' })
  } catch {}
}

export function esRepositorio(dir) {
  try {
    ejecutar(dir, 'git rev-parse --git-dir')
    return true
  } catch {
    return false
  }
}

export function estadoRepo(dir) {
  try {
    const rama = ejecutar(dir, 'git rev-parse --abbrev-ref HEAD').trim()
    let remoto = 'origin/main'
    try {
      const upstream = ejecutar(dir, 'git rev-parse --abbrev-ref @{u}').trim()
      if (upstream && upstream.includes('/')) remoto = upstream
    } catch {}
    const hash = ejecutar(dir, 'git rev-parse HEAD').trim()
    const corto = ejecutar(dir, 'git rev-parse --short HEAD').trim()
    return { rama, remoto, hash, corto }
  } catch {
    return null
  }
}

function respaldarArchivos(dir, relativos) {
  const datos = {}
  for (const relativo of relativos) {
    const completo = path.join(dir, relativo)
    if (!fs.existsSync(completo)) continue
    try {
      datos[relativo] = fs.readFileSync(completo, 'utf-8')
    } catch {}
  }
  return datos
}

function restaurarArchivos(dir, datos) {
  for (const [relativo, contenido] of Object.entries(datos)) {
    const completo = path.join(dir, relativo)
    try {
      fs.mkdirSync(path.dirname(completo), { recursive: true })
      fs.writeFileSync(completo, contenido)
    } catch {}
  }
}

/** Cambios locales del usuario (para no perderlos al hacer reset). */
export function cambiosLocales(dir) {
  try {
    return ejecutar(dir, 'git diff --binary')
  } catch {
    return ''
  }
}

function reaplicarCambios(dir, diff) {
  if (!diff || !diff.trim()) return false
  const archivo = path.join(dir, '.pain-panel-update.patch')
  try {
    fs.writeFileSync(archivo, diff)
    ejecutar(dir, `git apply --3way "${archivo}"`)
    return true
  } catch {
    return false
  } finally {
    try { fs.rmSync(archivo, { force: true }) } catch {}
  }
}

function commitsEntre(dir, desde, hasta) {
  if (!desde || !hasta || desde === hasta) return []
  try {
    return ejecutar(dir, `git log --oneline ${desde}..${hasta}`).trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

function archivosCambiados(dir, desde, hasta) {
  if (!desde || !hasta || desde === hasta) return []
  try {
    return ejecutar(dir, `git diff --name-only ${desde}..${hasta}`).trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Trae el código del remoto y lo deja listo para aplicar en caliente.
 * No reinicia nada: solo deja el disco actualizado y guarda los cambios
 * locales del usuario.
 */
export function actualizarDesdeRemoto(dir, { preservar = PRESERVAR } = {}) {
  if (!esRepositorio(dir)) {
    throw new Error('La carpeta del bot no es un repositorio de git.')
  }
  const antes = estadoRepo(dir)
  if (!antes) throw new Error('No se pudo leer el estado del repositorio.')

  const diff = cambiosLocales(dir)
  const respaldos = respaldarArchivos(dir, preservar)

  ejecutarIgnorando(dir, 'git fetch origin')
  const remoto = antes.remoto || 'origin/main'
  let salida = ''
  try {
    salida = ejecutar(dir, `git reset --hard ${remoto}`).trim()
  } catch (error) {
    restaurarArchivos(dir, respaldos)
    reaplicarCambios(dir, diff)
    const detalle = error?.stderr?.toString?.() || error?.message || String(error)
    throw new Error(`No se pudo actualizar: ${detalle.slice(0, 300)}`)
  }

  restaurarArchivos(dir, respaldos)
  const reaplícados = reaplicarCambios(dir, diff)

  const despues = estadoRepo(dir)
  return {
    antes,
    despues,
    salida,
    commits: commitsEntre(dir, antes.hash, despues?.hash),
    archivos: archivosCambiados(dir, antes.hash, despues?.hash),
    cambiosLocalesConservados: reaplícados,
    habiaCambiosLocales: Boolean(diff && diff.trim()),
  }
}
