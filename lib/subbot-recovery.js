import fs from 'fs'
import path from 'path'

export const ARCHIVO_REENLACE_PENDIENTE = '.needs-relink'

export function sesionRequiereVincular(rutaSesion) {
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
