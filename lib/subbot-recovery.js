import fs from 'fs'
import path from 'path'

export const ARCHIVO_REENLACE_PENDIENTE = '.needs-relink'
const vinculacionesEnCurso = new Set()

function claveSesion(rutaSesion) {
  return path.resolve(rutaSesion)
}

export function marcarVinculacionEnCurso(rutaSesion) {
  vinculacionesEnCurso.add(claveSesion(rutaSesion))
}

export function finalizarVinculacion(rutaSesion) {
  vinculacionesEnCurso.delete(claveSesion(rutaSesion))
}

export function vinculacionEnCurso(rutaSesion) {
  return vinculacionesEnCurso.has(claveSesion(rutaSesion))
}

export function sesionRequiereVincular(rutaSesion) {
  if (vinculacionEnCurso(rutaSesion)) return false
  const rutaMarca = path.join(rutaSesion, ARCHIVO_REENLACE_PENDIENTE)
  if (!fs.existsSync(rutaMarca)) return false

  try {
    const marca = JSON.parse(fs.readFileSync(rutaMarca, 'utf8'))
    return Number(marca?.reason) !== 440
  } catch {
    return true
  }
}

export function limpiarMarcaReenlace(rutaSesion) {
  const rutaMarca = path.join(rutaSesion, ARCHIVO_REENLACE_PENDIENTE)
  if (fs.existsSync(rutaMarca)) fs.unlinkSync(rutaMarca)
}

export function limpiarCredencialesSubBot(
  rutaSesion,
  raizSubBots = path.resolve(process.cwd(), global.bot || 'Serbot')
) {
  const raiz = path.resolve(raizSubBots)
  const sesion = path.resolve(rutaSesion)
  const carpeta = path.basename(sesion)
  if (
    path.dirname(sesion) !== raiz ||
    !/^[a-zA-Z0-9_-]+$/.test(carpeta)
  ) {
    throw new Error('La ruta de sesión del sub-bot no es válida para limpiar credenciales.')
  }
  if (!fs.existsSync(sesion)) return false
  const info = fs.lstatSync(sesion)
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error('La ruta de sesión del sub-bot debe ser una carpeta real.')
  }

  const preservar = new Set([
    'config.json',
    'staff.json',
    'soporte.json',
    ARCHIVO_REENLACE_PENDIENTE
  ])
  for (const entrada of fs.readdirSync(sesion)) {
    if (preservar.has(entrada)) continue
    fs.rmSync(path.join(sesion, entrada), { recursive: true, force: true })
  }
  return true
}
