/**
 * Catálogo central de permisos del panel.
 *
 * Los roles guardan una lista de estas claves. El rol principal usa `*`
 * (todos los permisos, incluidos los que se añadan en el futuro). Los
 * permisos de Turnstile y gestión de roles se pueden delegar explícitamente;
 * no se incluyen por defecto en el rol Administrador.
 */

export const PERMISSIONS = [
  // Acceso general
  { key: 'admin.access', label: 'Entrar al panel de administración', group: 'General', scope: 'admin' },
  { key: 'admin.overview', label: 'Ver el resumen del servidor', group: 'General', scope: 'admin' },
  { key: 'admin.update', label: 'Actualizar y recargar el código', group: 'General', scope: 'admin' },

  // Bot principal
  { key: 'admin.main', label: 'Gestionar el bot principal', group: 'Bot principal', scope: 'admin' },

  // Usuarios
  { key: 'admin.users', label: 'Ver usuarios', group: 'Usuarios', scope: 'admin' },
  { key: 'admin.users.edit', label: 'Editar usuarios (estado y contraseña)', group: 'Usuarios', scope: 'admin' },
  { key: 'admin.users.roles', label: 'Asignar roles a usuarios', group: 'Usuarios', scope: 'admin' },
  { key: 'admin.users.delete', label: 'Eliminar usuarios', group: 'Usuarios', scope: 'admin' },
  { key: 'admin.users.impersonate', label: 'Entrar como otro usuario', group: 'Usuarios', scope: 'admin' },

  // Sesiones y vinculaciones
  { key: 'admin.sessions', label: 'Ver sesiones de sub-bots', group: 'Sesiones', scope: 'admin' },
  { key: 'admin.sessions.config', label: 'Editar configuración de sub-bots de otros usuarios', group: 'Sesiones', scope: 'admin' },
  { key: 'admin.sessions.reconnect', label: 'Reconectar sub-bots', group: 'Sesiones', scope: 'admin' },
  { key: 'admin.sessions.delete', label: 'Eliminar sesiones de sub-bots', group: 'Sesiones', scope: 'admin' },
  { key: 'admin.pairings', label: 'Ver historial de vinculaciones', group: 'Sesiones', scope: 'admin' },

  // Comunidades
  { key: 'admin.communities', label: 'Ver comunidades', group: 'Comunidades', scope: 'admin' },
  { key: 'admin.communities.edit', label: 'Crear, editar y borrar comunidades', group: 'Comunidades', scope: 'admin' },

  // Auditoría
  { key: 'admin.audit', label: 'Ver la auditoría', group: 'Auditoría', scope: 'admin' },

  // Ajustes
  { key: 'admin.settings', label: 'Ver los ajustes del panel', group: 'Ajustes', scope: 'admin' },
  { key: 'admin.settings.limits', label: 'Cambiar límites de sub-bots y vinculación', group: 'Ajustes', scope: 'admin' },
  { key: 'admin.settings.mail', label: 'Configurar correo y plantillas', group: 'Ajustes', scope: 'admin' },
  {
    key: 'admin.settings.turnstile',
    label: 'Configurar Cloudflare Turnstile',
    group: 'Ajustes',
    scope: 'admin',
  },
  {
    key: 'admin.settings.roles',
    label: 'Crear y editar roles y permisos',
    group: 'Ajustes',
    scope: 'admin',
  },

  // Permisos de usuario (también configurables en roles personalizados)
  { key: 'bots.view', label: 'Ver sus propios sub-bots', group: 'Usuario', scope: 'user' },
  { key: 'bots.link', label: 'Vincular nuevos sub-bots', group: 'Usuario', scope: 'user' },
  { key: 'bots.config', label: 'Editar la configuración de sus sub-bots', group: 'Usuario', scope: 'user' },
  { key: 'bots.reconnect', label: 'Reconectar sus sub-bots', group: 'Usuario', scope: 'user' },
  { key: 'bots.delete', label: 'Eliminar sus sub-bots', group: 'Usuario', scope: 'user' },
  { key: 'communities.view', label: 'Ver comunidades publicadas', group: 'Usuario', scope: 'user' },
]

export const ALL_PERMISSIONS = PERMISSIONS.map((permiso) => permiso.key)
export const PRINCIPAL_ONLY = new Set(
  PERMISSIONS.filter((permiso) => permiso.principalOnly).map((permiso) => permiso.key)
)

export const DEFAULT_ADMIN_PERMISSIONS = ALL_PERMISSIONS.filter(
  (key) => key.startsWith('admin.') && !PRINCIPAL_ONLY.has(key)
    && !['admin.settings.turnstile', 'admin.settings.roles'].includes(key)
)

export const DEFAULT_USER_PERMISSIONS = [
  'bots.view',
  'bots.link',
  'bots.config',
  'bots.reconnect',
  'bots.delete',
  'communities.view',
]

export function permisosValidos(scope = 'admin') {
  return PERMISSIONS
    .filter((permiso) => (scope === 'user' ? permiso.scope === 'user' : true))
    .map((permiso) => permiso.key)
}

export function normalizarPermisos(lista, scope = 'admin') {
  const permitidos = new Set(permisosValidos(scope))
  const vistos = new Set()
  for (const valor of Array.isArray(lista) ? lista : []) {
    const key = String(valor || '').trim()
    if (!permitidos.has(key) || PRINCIPAL_ONLY.has(key) || vistos.has(key)) continue
    vistos.add(key)
  }
  return [...vistos]
}

export function parsearPermisos(valor) {
  try {
    if (Array.isArray(valor)) return valor.map(String)
    const datos = JSON.parse(String(valor || '[]'))
    return Array.isArray(datos) ? datos.map(String) : []
  } catch {
    return []
  }
}

export function tienePermiso(permisos, key) {
  if (!Array.isArray(permisos)) return false
  if (permisos.includes('*')) return true
  if (permisos.includes(key)) return true
  // Quien puede entrar al panel de administración también hereda las
  // funciones normales de usuario (sus propios sub-bots, su cuenta, etc.).
  if (!String(key).startsWith('admin.') && permisos.includes('admin.access')) return true
  return false
}

export function esAdminPermisos(permisos) {
  return tienePermiso(permisos, 'admin.access')
}

export function permisosLegacy(role) {
  return role === 'admin' ? DEFAULT_ADMIN_PERMISSIONS : DEFAULT_USER_PERMISSIONS
}
