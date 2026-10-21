import fs from 'fs'
import path from 'path'

export const ARCHIVO_REENLACE_PENDIENTE = '.needs-relink'
// Marca temporal mientras el panel web está vinculando esta sesión. El
// supervisor y los barridos la ignoran para no conectar/archivar la carpeta a
// mitad del emparejamiento.
export const ARCHIVO_PAIRING = '.pairing'
// Registro liviano de ajustes. Cuando una sesión queda rechazada se archiva su
// carpeta (para que no se acumulen) y aquí se conservan config/staff/soporte,
// que se restauran solos al volver a vincular. Un subdirectorio por sesión con
// unos pocos archivos de texto: no consume RAM ni CPU en marcha.
export const DIR_AJUSTES_SESION = '_prefs'
const AJUSTES_PRESERVADOS = ['config.json', 'staff.json', 'soporte.json']
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

/** ¿La sesión se está vinculando ahora mismo desde el panel web? */
export function sesionEnEmparejamiento(rutaSesion) {
  return fs.existsSync(path.join(rutaSesion, ARCHIVO_PAIRING))
}

/** Marca una sesión como "en emparejamiento" para que nadie más la toque. */
export function marcarEmparejamiento(rutaSesion, datos = {}) {
  fs.mkdirSync(rutaSesion, { recursive: true })
  fs.writeFileSync(
    path.join(rutaSesion, ARCHIVO_PAIRING),
    JSON.stringify({ ...datos, startedAt: new Date().toISOString() }, null, 2)
  )
}

/** Quita la marca de emparejamiento (al terminar, con éxito o error). */
export function limpiarEmparejamiento(rutaSesion) {
  const rutaMarca = path.join(rutaSesion, ARCHIVO_PAIRING)
  try {
    if (fs.existsSync(rutaMarca)) fs.unlinkSync(rutaMarca)
  } catch {}
}

/** Quita marcas .pairing de un arranque anterior (proceso principal reiniciado). */
export function limpiarEmparejamientos(raiz) {
  let total = 0
  try {
    for (const info of fs.readdirSync(raiz, { withFileTypes: true })) {
      if (!info.isDirectory() || info.isSymbolicLink()) continue
      const marca = path.join(raiz, info.name, ARCHIVO_PAIRING)
      try {
        if (fs.existsSync(marca)) {
          fs.unlinkSync(marca)
          total++
        }
      } catch {}
    }
  } catch {}
  return total
}

function esCarpetaSesion(raiz, nombre) {
  try {
    return fs.statSync(path.join(raiz, nombre)).isDirectory()
  } catch {
    return false
  }
}

// Valida que la ruta sea una carpeta de sesión directa de la raíz de sub-bots
// (evita borrar fuera de lugar o la propia carpeta del registro).
function validarRutaSesion(rutaSesion, raizSubBots) {
  const raiz = path.resolve(raizSubBots)
  const sesion = path.resolve(rutaSesion)
  const carpeta = path.basename(sesion)
  if (
    path.dirname(sesion) !== raiz ||
    !/^[a-zA-Z0-9_-]+$/.test(carpeta) ||
    carpeta === DIR_AJUSTES_SESION
  ) {
    throw new Error('La ruta de sesión del sub-bot no es válida para limpiar credenciales.')
  }
  return { raiz, sesion, carpeta }
}

/** Ruta del registro de ajustes de una sesión. */
export function dirAjustesSesion(
  carpeta,
  raizSubBots = path.resolve(process.cwd(), global.bot || 'Serbot')
) {
  return path.join(path.resolve(raizSubBots), DIR_AJUSTES_SESION, carpeta)
}

/** ¿Hay ajustes conservados de esta sesión, listos para restaurar? */
export function tieneAjustesGuardados(raiz, nombre) {
  if (!raiz || !nombre || nombre === DIR_AJUSTES_SESION) return false
  if (!/^[a-zA-Z0-9_-]+$/.test(nombre)) return false
  return esCarpetaSesion(path.join(raiz, DIR_AJUSTES_SESION), nombre)
}

/** Nombres de sesión con ajustes conservados en el registro. */
export function listarAjustesGuardados(raiz) {
  if (!raiz) return []
  const base = path.join(raiz, DIR_AJUSTES_SESION)
  if (!fs.existsSync(base)) return []
  try {
    return fs.readdirSync(base).filter((nombre) =>
      /^[a-zA-Z0-9_-]+$/.test(nombre) && esCarpetaSesion(base, nombre)
    )
  } catch {
    return []
  }
}

/**
 * Copia config/staff/soporte de una sesión al registro liviano para poder
 * restaurarlos al volver a vincular. No modifica la sesión original.
 */
export function conservarAjustesSesion(rutaSesion, raizSubBots) {
  const { raiz, sesion, carpeta } = validarRutaSesion(rutaSesion, raizSubBots)
  if (!fs.existsSync(sesion)) return false
  const destino = dirAjustesSesion(carpeta, raiz)
  fs.mkdirSync(destino, { recursive: true })
  let copiado = false
  for (const nombre of AJUSTES_PRESERVADOS) {
    const origen = path.join(sesion, nombre)
    if (!fs.existsSync(origen)) continue
    fs.copyFileSync(origen, path.join(destino, nombre))
    copiado = true
  }
  // Deja constancia del motivo aunque no haya ajustes que copiar, para que la
  // sesión siga apareciendo como pendiente de revincular.
  try {
    const marca = path.join(sesion, ARCHIVO_REENLACE_PENDIENTE)
    const detalle = fs.existsSync(marca)
      ? fs.readFileSync(marca, 'utf8')
      : JSON.stringify({ archivedAt: new Date().toISOString() })
    fs.writeFileSync(path.join(destino, ARCHIVO_REENLACE_PENDIENTE), detalle)
  } catch {}
  return copiado
}

/**
 * Restaura en la sesión los ajustes conservados. No sobreescribe archivos que
 * ya existan (por si se recrearon). Devuelve true si había registro.
 */
export function restaurarAjustesSesion(rutaSesion, raizSubBots) {
  const { raiz, sesion, carpeta } = validarRutaSesion(rutaSesion, raizSubBots)
  const origen = dirAjustesSesion(carpeta, raiz)
  if (!fs.existsSync(origen)) return false
  fs.mkdirSync(sesion, { recursive: true })
  for (const nombre of AJUSTES_PRESERVADOS) {
    const archivo = path.join(origen, nombre)
    if (!fs.existsSync(archivo)) continue
    const destino = path.join(sesion, nombre)
    if (fs.existsSync(destino)) continue
    fs.copyFileSync(archivo, destino)
  }
  return true
}

/** Olvida los ajustes conservados de una sesión (ya revinculada o borrada). */
export function olvidarAjustesSesion(rutaSesion, raizSubBots) {
  const { raiz, carpeta } = validarRutaSesion(rutaSesion, raizSubBots)
  const destino = dirAjustesSesion(carpeta, raiz)
  if (fs.existsSync(destino)) fs.rmSync(destino, { recursive: true, force: true })
}

/**
 * ¿Esta sesión necesita que el usuario la vuelva a vincular? Cubre tanto las
 * marcas todavía presentes como las sesiones ya archivadas que solo conservan
 * sus ajustes en el registro.
 */
export function necesitaRevinculacion(raiz, nombre) {
  if (!raiz || !nombre || nombre === DIR_AJUSTES_SESION) return false
  if (!/^[a-zA-Z0-9_-]+$/.test(nombre)) return false
  const ruta = path.join(raiz, nombre)
  if (vinculacionEnCurso(ruta)) return false
  if (sesionRequiereVincular(ruta)) return true
  if (fs.existsSync(path.join(ruta, 'creds.json'))) return false
  return tieneAjustesGuardados(raiz, nombre)
}

/**
 * Carpetas que requieren volver a vincular, TENGAN o no creds.json, incluidas
 * las ya archivadas (ajustes conservados sin sesión activa).
 */
export function listarRequierenVincular(raiz) {
  if (!raiz || !fs.existsSync(raiz)) return []
  const candidatos = new Set()
  try {
    for (const nombre of fs.readdirSync(raiz)) {
      if (nombre === DIR_AJUSTES_SESION) continue
      if (esCarpetaSesion(raiz, nombre)) candidatos.add(nombre)
    }
  } catch {}
  for (const nombre of listarAjustesGuardados(raiz)) candidatos.add(nombre)
  return [...candidatos].filter((nombre) => necesitaRevinculacion(raiz, nombre))
}

/** Carpetas con creds.json (sesiones guardadas). */
export function listarSesionesConCreds(raiz) {
  if (!raiz || !fs.existsSync(raiz)) return []
  return fs.readdirSync(raiz).filter((nombre) =>
    esCarpetaSesion(raiz, nombre) && fs.existsSync(path.join(raiz, nombre, 'creds.json'))
  )
}

export function limpiarCredencialesSubBot(
  rutaSesion,
  raizSubBots = path.resolve(process.cwd(), global.bot || 'Serbot')
) {
  const { sesion } = validarRutaSesion(rutaSesion, raizSubBots)
  if (!fs.existsSync(sesion)) return false
  const info = fs.lstatSync(sesion)
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error('La ruta de sesión del sub-bot debe ser una carpeta real.')
  }

  const preservar = new Set([
    ...AJUSTES_PRESERVADOS,
    ARCHIVO_REENLACE_PENDIENTE,
    ARCHIVO_PAIRING
  ])
  for (const entrada of fs.readdirSync(sesion)) {
    if (preservar.has(entrada)) continue
    fs.rmSync(path.join(sesion, entrada), { recursive: true, force: true })
  }
  return true
}

/**
 * Archiva una sesión que quedó rechazada: conserva config/staff/soporte en el
 * registro y borra su carpeta para que no se acumule. Al volver a vincularla
 * con /code o /qr sus ajustes se restauran solos.
 */
export function purgarSesionReenlace(rutaSesion, raizSubBots) {
  const { sesion } = validarRutaSesion(rutaSesion, raizSubBots)
  if (!fs.existsSync(sesion)) return false
  conservarAjustesSesion(sesion, raizSubBots)
  fs.rmSync(sesion, { recursive: true, force: true })
  return true
}

/**
 * Barre la raíz de sub-bots archivando todas las sesiones marcadas para
 * revincular. Devuelve los nombres archivados.
 */
export function purgarSesionesReenlace(raiz) {
  if (!raiz || !fs.existsSync(raiz)) return []
  let nombres
  try {
    nombres = fs.readdirSync(raiz)
  } catch {
    return []
  }
  const purgadas = []
  for (const nombre of nombres) {
    if (nombre === DIR_AJUSTES_SESION) continue
    if (!/^[a-zA-Z0-9_-]+$/.test(nombre)) continue
    const ruta = path.join(raiz, nombre)
    let info
    try {
      info = fs.lstatSync(ruta)
    } catch {
      continue
    }
    if (!info.isDirectory() || info.isSymbolicLink()) continue
    if (sesionEnEmparejamiento(ruta)) continue
    if (!sesionRequiereVincular(ruta)) continue
    try {
      conservarAjustesSesion(ruta, raiz)
      fs.rmSync(ruta, { recursive: true, force: true })
      purgadas.push(nombre)
    } catch {}
  }
  return purgadas
}
