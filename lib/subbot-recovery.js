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
