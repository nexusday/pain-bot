/**
 * Modo juegos por grupo: /games on|off
 * - Guardado en DB: global.db.data.modoGames = { "<chatJid>": true/false }
 * - Por defecto APAGADO (solo true explícito lo activa): cada grupo usa
 *   /games on para permitir juegos.
 * - La detección de qué plugin es "juego" es AUTOMÁTICA (tags + nombre
 *   de archivo), no hay lista manual de comandos que mantener.
 */

const CLAVE_MODO = 'modoGames'

function normalizarEtiqueta(valor) {
  return String(valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

// Etiquetas que marcan un plugin como juego/economía.
const ETIQUETAS_JUEGO = new Set([
  'juego',
  'juegos',
  'game',
  'games',
  'economia',
  'gacha',
  'multijugador',
  'casino',
])

// Etiquetas que NUNCA son juegos aunque lleven 'rpg':
// - 'grupo'/'admins' -> moderación o ranks de grupo (top-activos, top-inactivos)
// - 'perfil'/'perfiles' -> perfil de usuario (rpg-marry)
// - 'owner' -> administración del bot
const ETIQUETAS_NO_JUEGO = new Set([
  'grupo',
  'grupos',
  'admin',
  'admins',
  'owner',
  'owners',
  'perfil',
  'perfiles',
])

function etiquetasDe(plugin) {
  const crudas = plugin?.tags || plugin?.handler?.tags || []
  return (Array.isArray(crudas) ? crudas : [crudas]).map(normalizarEtiqueta).filter(Boolean)
}

function nombreBaseArchivo(filename = '') {
  const base = String(filename || '').split(/[\\/]/).pop().toLowerCase()
  return base.endsWith('.js') ? base : `${base}`
}

/**
 * ¿Este plugin pertenece al menú de juegos? Detección automática:
 * 1) tags de juego (juegos/economía/gacha/multijugador/game...), o
 * 2) tag único 'rpg' (ahorcado, cazar, cofre, crimen, ppt...), o
 * 3) archivo rpg-xxx / economia-xxx / game-xxx (cubre comandos futuros sin tocar nada).
 * Se excluyen marry (perfil), tops de grupo y admins aunque lleven 'rpg'.
 */
export function esPluginJuegos(plugin, filename = '') {
  const base = nombreBaseArchivo(filename)
  // Perfil y matrimonio nunca se bloquean con /games off.
  if (base === 'rpg-marry.js' || base.startsWith('perfiles-')) return false
  const tags = etiquetasDe(plugin)
  if (!tags.length && !base) return false
  if (tags.some((t) => ETIQUETAS_NO_JUEGO.has(t))) return false
  if (tags.some((t) => ETIQUETAS_JUEGO.has(t))) return true
  if (tags.length === 1 && tags[0] === 'rpg') return true
  if (!base) return false
  return /^(rpg|economia|game)-[^\\/]*\.js$/.test(base)
}

export function asegurarMapaJuegos() {
  const actual = global.db?.data?.[CLAVE_MODO]
  const mapa =
    actual && typeof actual === 'object' && !Array.isArray(actual) ? actual : {}
  if (global.db?.data) global.db.data[CLAVE_MODO] = mapa
  return mapa
}

/** true = se pueden usar juegos en este chat (defecto: false, opt-in con /games on). */
export function juegosActivados(chatId) {
  const mapa = global.db?.data?.[CLAVE_MODO]
  if (!mapa || typeof mapa !== 'object' || Array.isArray(mapa)) return false
  return mapa[chatId] === true
}

export function establecerJuegos(chatId, activo) {
  const mapa = asegurarMapaJuegos()
  mapa[String(chatId)] = activo === true
  return mapa
}

/**
 * Gate para comandos: si el plugin es juego y el grupo lo tiene off,
 * avisa una vez y retorna true (bloqueado). Owners pasan siempre.
 */
export async function verificarComandoJuegos(
  m,
  conn,
  plugin,
  filename,
  prefijoUsado = '.',
  isOwner = false,
  isROwner = false
) {
  if (!m?.isGroup || isOwner || isROwner) return false
  if (!esPluginJuegos(plugin, filename)) return false
  if (juegosActivados(m.chat)) return false
  await conn
    .sendMessage(
      m.chat,
      {
        text: `🎮 *Juegos desactivados en este grupo.*\n\nUn administrador debe activarlos con:\n> ${prefijoUsado}games on`,
        contextInfo: { ...(global.rcanal?.contextInfo || {}) },
      },
      { quoted: m }
    )
    .catch(() => {})
  return true
}

/** Gate para flujos sin prefijo (movimientos michi/miner/bomba, adivinanzas, invites). */
export function juegosBloqueadosEn(chat, { isOwner = false, isROwner = false } = {}) {
  if (!chat || !String(chat).endsWith('@g.us')) return false
  if (isOwner || isROwner) return false
  return !juegosActivados(chat)
}

export {
  asegurarMapaJuegos as ensureGamesMap,
  juegosActivados as isGamesEnabled,
  establecerJuegos as setGamesEnabled,
  esPluginJuegos as isGamesPlugin,
  verificarComandoJuegos as checkGamesCommand,
  juegosBloqueadosEn as isGamesBlockedIn,
}
