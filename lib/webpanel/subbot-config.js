import fs from 'node:fs'
import path from 'node:path'

/**
 * Configuración de un sub-bot (la misma que editan los comandos
 * /setbotname, /setbotimg, /setautoread, /setlen y /setmenu).
 *
 * Todo vive en `Serbot/<número>/config.json`, así que lo que se cambia desde
 * el panel es exactamente lo que lee el bot en WhatsApp.
 */

export const IDIOMAS = ['es', 'en', 'pt']
export const MODOS_MENU = ['android', 'ios']
export const NOMBRE_MAX = 40

export function rutaConfigSubBot(root, phone) {
  return path.join(root, String(phone), 'config.json')
}

// Caché por mtime/tamaño: el dashboard lee el premium de cada sesión cada
// pocos segundos. Sin caché eran cientos de lecturas+JSON.parse por sondeo.
const cacheConfig = new Map()

export function leerConfigSubBot(root, phone) {
  const archivo = rutaConfigSubBot(root, phone)
  try {
    const info = fs.statSync(archivo)
    const clave = `${info.mtimeMs}:${info.size}`
    const cacheado = cacheConfig.get(archivo)
    if (cacheado?.clave === clave) return cacheado.datos
    const datos = JSON.parse(fs.readFileSync(archivo, 'utf8'))
    const valor = datos && typeof datos === 'object' && !Array.isArray(datos) ? datos : {}
    cacheConfig.set(archivo, { clave, datos: valor })
    if (cacheConfig.size > 20_000) cacheConfig.clear()
    return valor
  } catch {
    cacheConfig.delete(archivo)
    return {}
  }
}

export function guardarConfigSubBot(root, phone, cambios) {
  const archivo = rutaConfigSubBot(root, phone)
  const carpeta = path.dirname(archivo)
  if (!fs.existsSync(carpeta)) fs.mkdirSync(carpeta, { recursive: true })
  const datos = leerConfigSubBot(root, phone)
  const siguiente = { ...datos, ...cambios }
  fs.writeFileSync(archivo, JSON.stringify(siguiente, null, 2))
  // Mantiene el caché coherente tras una escritura (premium, imagen, etc.).
  try {
    const info = fs.statSync(archivo)
    cacheConfig.set(archivo, { clave: `${info.mtimeMs}:${info.size}`, datos: siguiente })
  } catch {
    cacheConfig.delete(archivo)
  }
  return siguiente
}

/** Normaliza y valida los cambios que llegan del panel. */
export function sanearCambiosConfig(entrada = {}) {
  const cambios = {}
  const errores = []

  if (entrada.name !== undefined) {
    const name = String(entrada.name || '').trim().slice(0, NOMBRE_MAX)
    if (name.length < 1) errores.push('El nombre no puede estar vacío.')
    else cambios.name = name
  }

  if (entrada.autoRead !== undefined) cambios.autoRead = entrada.autoRead === true

  if (entrada.lang !== undefined) {
    const lang = String(entrada.lang || '').toLowerCase()
    if (!IDIOMAS.includes(lang)) errores.push('Idioma no válido (es, en, pt).')
    else cambios.lang = lang
  }

  if (entrada.menuModo !== undefined) {
    const modo = String(entrada.menuModo || '').toLowerCase()
    if (!MODOS_MENU.includes(modo)) errores.push('Modo de menú no válido (ios, android).')
    else cambios.menuModo = modo
  }

  return { cambios, errores }
}

/** Configuración "limpia" para el panel (sin rutas absolutas del servidor). */
export function configPublicaSubBot(config = {}) {
  return {
    name: config.name || '',
    img: config.img ? path.basename(String(config.img)) : '',
    autoRead: config.autoRead === true,
    lang: IDIOMAS.includes(config.lang) ? config.lang : 'es',
    menuModo: MODOS_MENU.includes(config.menuModo) ? config.menuModo : 'android',
  }
}

const TIPOS_IMAGEN = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const MAX_IMAGEN = 4 * 1024 * 1024

/**
 * Guarda la imagen del sub-bot (el "logo" del menú) y devuelve la ruta.
 * Acepta un data URL (base64) que es lo que manda el navegador.
 */
export function guardarImagenSubBot(root, phone, dataUrl) {
  const bruto = String(dataUrl || '')
  const coincidencia = bruto.match(/^data:(image\/[a-z+]+);base64,(.+)$/i)
  if (!coincidencia) {
    const error = new Error('La imagen no tiene un formato válido.')
    error.code = 'invalid_image'
    throw error
  }
  const mime = coincidencia[1].toLowerCase()
  const extension = TIPOS_IMAGEN[mime]
  if (!extension) {
    const error = new Error('Solo se admiten imágenes JPG, PNG o WEBP.')
    error.code = 'invalid_image'
    throw error
  }
  let buffer
  try {
    buffer = Buffer.from(coincidencia[2], 'base64')
  } catch {
    const error = new Error('No se pudo leer la imagen.')
    error.code = 'invalid_image'
    throw error
  }
  if (!buffer.length) {
    const error = new Error('La imagen está vacía.')
    error.code = 'invalid_image'
    throw error
  }
  if (buffer.length > MAX_IMAGEN) {
    const error = new Error('La imagen es muy grande (máximo 4 MB).')
    error.code = 'image_too_big'
    throw error
  }

  const carpeta = path.join(root, String(phone))
  if (!fs.existsSync(carpeta)) fs.mkdirSync(carpeta, { recursive: true })
  const archivo = path.join(carpeta, `img_${Date.now()}.${extension}`)
  fs.writeFileSync(archivo, buffer)
  return { ruta: archivo, nombre: path.basename(archivo), bytes: buffer.length }
}

/** Ruta absoluta de la imagen configurada (o null). */
export function rutaImagenSubBot(root, phone) {
  const config = leerConfigSubBot(root, phone)
  if (!config.img) return null
  const directa = path.isAbsolute(config.img) ? config.img : path.resolve(process.cwd(), config.img)
  try {
    if (fs.existsSync(directa)) return directa
  } catch {}
  return null
}
