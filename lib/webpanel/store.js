import fs from 'node:fs'
import path from 'node:path'
import sqlite3 from 'sqlite3'
import { initPush } from './push.js'
import {
  DEFAULT_ADMIN_PERMISSIONS,
  DEFAULT_USER_PERMISSIONS,
  parsearPermisos,
} from './permissions.js'

/**
 * Almacenamiento del panel web. Es un SQLite APARTE del que usan los bots
 * (`storage/webpanel.sqlite`): así las cuentas, sesiones web y auditoría no
 * compiten con la base caliente del bot ni se mezclan con sus datos.
 */

function abrirBase(filename) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(filename, (error) => {
      if (error) reject(error)
      else resolve(db)
    })
  })
}

function ejecutar(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onDone(error) {
      if (error) reject(error)
      else resolve({ lastID: this.lastID, changes: this.changes })
    })
  })
}

function ejecutarVarias(db, sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

function consultarUno(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) reject(error)
      else resolve(row || null)
    })
  })
}

function consultarTodos(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) reject(error)
      else resolve(rows || [])
    })
  })
}

export class PanelStore {
  constructor(filename) {
    this.filename = filename
    this.db = null
    this.ready = false
  }

  async init() {
    if (this.ready) return this
    fs.mkdirSync(path.dirname(this.filename), { recursive: true })
    this.db = await abrirBase(this.filename)
    await ejecutar(this.db, 'PRAGMA journal_mode = WAL')
    await ejecutar(this.db, 'PRAGMA busy_timeout = 8000')
    await ejecutar(this.db, 'PRAGMA foreign_keys = ON')
    await ejecutar(this.db, 'PRAGMA synchronous = NORMAL')
    await ejecutarVarias(this.db, `
      CREATE TABLE IF NOT EXISTS panel_roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL,
        description TEXT,
        scope TEXT NOT NULL DEFAULT 'admin',
        permissions TEXT NOT NULL DEFAULT '[]',
        system INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS panel_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        email TEXT UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        role_id INTEGER,
        is_principal INTEGER NOT NULL DEFAULT 0,
        email_verified_at INTEGER,
        status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL,
        last_login_at INTEGER,
        last_ip TEXT,
        FOREIGN KEY (role_id) REFERENCES panel_roles(id) ON DELETE SET NULL
      );
      CREATE TABLE IF NOT EXISTS panel_web_sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        csrf_token TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        ip TEXT,
        user_agent TEXT,
        FOREIGN KEY (user_id) REFERENCES panel_users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS panel_bots (
        phone TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        folder TEXT NOT NULL,
        label TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        linked_at INTEGER,
        last_seen_at INTEGER,
        created_at INTEGER NOT NULL,
        linked_ip TEXT,
        FOREIGN KEY (user_id) REFERENCES panel_users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS panel_pairings (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        phone TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        code TEXT,
        error TEXT,
        ip TEXT,
        user_agent TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        linked_at INTEGER,
        FOREIGN KEY (user_id) REFERENCES panel_users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS panel_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT NOT NULL,
        ip TEXT,
        meta TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS panel_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      CREATE TABLE IF NOT EXISTS panel_email_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        email TEXT NOT NULL COLLATE NOCASE,
        purpose TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        used_at INTEGER,
        ip TEXT,
        FOREIGN KEY (user_id) REFERENCES panel_users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS panel_communities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        link TEXT NOT NULL,
        description TEXT,
        created_by INTEGER,
        active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (created_by) REFERENCES panel_users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_panel_bots_user ON panel_bots(user_id);
      CREATE INDEX IF NOT EXISTS idx_panel_pairings_phone ON panel_pairings(phone, created_at);
      CREATE INDEX IF NOT EXISTS idx_panel_pairings_user ON panel_pairings(user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_panel_audit_created ON panel_audit(created_at);
      CREATE INDEX IF NOT EXISTS idx_panel_web_sessions_user ON panel_web_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_panel_email_tokens_user ON panel_email_tokens(user_id, purpose, created_at);
      CREATE INDEX IF NOT EXISTS idx_panel_email_tokens_expires ON panel_email_tokens(expires_at);
    `)
    await this.#asegurarColumnas()
    // Las bases antiguas todavía no tienen role_id al crear las tablas.
    await ejecutar(this.db, 'CREATE INDEX IF NOT EXISTS idx_panel_users_role ON panel_users(role_id)')
    await this.#sembrarRoles()
    await this.#migrarRoles()
    await initPush(this)
    this.ready = true
    return this
  }

  /** Migraciones ligeras: columnas nuevas sin perder los datos existentes. */
  async #asegurarColumnas() {
    try {
      const info = await consultarTodos(this.db, 'PRAGMA table_info(panel_bots)')
      const columnas = new Set((info || []).map((fila) => fila.name))
      if (!columnas.has('linked_ip')) {
        await ejecutar(this.db, 'ALTER TABLE panel_bots ADD COLUMN linked_ip TEXT')
      }
      await ejecutar(this.db, 'CREATE INDEX IF NOT EXISTS idx_panel_bots_ip ON panel_bots(linked_ip)')
    } catch {}
    try {
      const info = await consultarTodos(this.db, 'PRAGMA table_info(panel_web_sessions)')
      const columnas = new Set((info || []).map((fila) => fila.name))
      if (!columnas.has('impersonated_by')) {
        await ejecutar(this.db, 'ALTER TABLE panel_web_sessions ADD COLUMN impersonated_by INTEGER')
      }
    } catch {}
    {
      const info = await consultarTodos(this.db, 'PRAGMA table_info(panel_users)')
      const columnas = new Set((info || []).map((fila) => fila.name))
      if (!columnas.has('role_id')) {
        await ejecutar(this.db, 'ALTER TABLE panel_users ADD COLUMN role_id INTEGER')
      }
      if (!columnas.has('is_principal')) {
        await ejecutar(this.db, 'ALTER TABLE panel_users ADD COLUMN is_principal INTEGER NOT NULL DEFAULT 0')
      }
      if (!columnas.has('email_verified_at')) {
        await ejecutar(this.db, 'ALTER TABLE panel_users ADD COLUMN email_verified_at INTEGER')
      }
    }
  }

  /** Roles base. No se sobrescriben si el principal ya los personalizó. */
  async #sembrarRoles() {
    const ahora = Date.now()
    const base = [
      {
        key: 'principal',
        name: 'Administrador principal',
        description: 'Control total del panel. No se puede borrar ni limitar.',
        scope: 'admin',
        permissions: ['*'],
        system: 1,
      },
      {
        key: 'admin',
        name: 'Administrador',
        description: 'Rol de administración editable por el principal.',
        scope: 'admin',
        permissions: DEFAULT_ADMIN_PERMISSIONS,
        system: 1,
      },
      {
        key: 'user',
        name: 'Usuario',
        description: 'Cuenta normal: sus sub-bots, su correo y las comunidades.',
        scope: 'user',
        permissions: DEFAULT_USER_PERMISSIONS,
        system: 1,
      },
    ]
    for (const rol of base) {
      const existente = await consultarUno(this.db, 'SELECT id FROM panel_roles WHERE key = ? COLLATE NOCASE', [rol.key])
      if (existente) continue
      await ejecutar(
        this.db,
        `INSERT INTO panel_roles (key, name, description, scope, permissions, system, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [rol.key, rol.name, rol.description, rol.scope, JSON.stringify(rol.permissions), rol.system, ahora, ahora]
      )
    }
  }

  /** Asigna roles a usuarios antiguos y garantiza un único principal. */
  async #migrarRoles() {
    const roles = await this.listarRoles()
    const porKey = new Map(roles.map((rol) => [rol.key, rol]))
    const sinRol = await consultarTodos(this.db, 'SELECT id, role, is_principal FROM panel_users WHERE role_id IS NULL')
    for (const usuario of sinRol) {
      const key = Number(usuario.is_principal) === 1 ? 'principal' : (usuario.role === 'admin' ? 'admin' : 'user')
      const rol = porKey.get(key) || porKey.get('user')
      if (rol) await ejecutar(this.db, 'UPDATE panel_users SET role_id = ? WHERE id = ?', [rol.id, usuario.id])
    }

    // Sincroniza la columna histórica `role` con el rol real.
    await ejecutar(
      this.db,
      `UPDATE panel_users SET role = COALESCE((
         SELECT CASE WHEN r.scope = 'admin' THEN 'admin' ELSE 'user' END
         FROM panel_roles r WHERE r.id = panel_users.role_id
       ), role)`
    )

    const principal = await consultarUno(this.db, 'SELECT id FROM panel_users WHERE is_principal = 1 ORDER BY id LIMIT 1')
    const principalRol = porKey.get('principal')
    if (!principal) {
      const admin = await consultarUno(
        this.db,
        "SELECT id FROM panel_users WHERE role = 'admin' AND status = 'active' ORDER BY id LIMIT 1"
      )
      if (admin && principalRol) await this.establecerPrincipal(admin.id)
    } else if (principalRol) {
      await ejecutar(
        this.db,
        "UPDATE panel_users SET role = 'admin', role_id = ? WHERE id = ?",
        [principalRol.id, principal.id]
      )
    }
    // Si por una migración antigua hubiera varios principales, se conserva el
    // más antiguo y los demás vuelven a administradores normales.
    await ejecutar(
      this.db,
      `UPDATE panel_users SET is_principal = 0
       WHERE is_principal = 1 AND id <> COALESCE((
         SELECT id FROM panel_users WHERE is_principal = 1 ORDER BY id LIMIT 1
       ), -1)`
    )
    if (principalRol && porKey.get('admin')) {
      await ejecutar(this.db,
        "UPDATE panel_users SET role_id = ?, role = 'admin' WHERE is_principal = 0 AND role_id = ?",
        [porKey.get('admin').id, principalRol.id]
      )
    }
  }

  async close() {
    if (!this.db) return
    const db = this.db
    this.db = null
    this.ready = false
    await new Promise((resolve) => db.close(() => resolve()))
  }

  // ── Roles y permisos ──────────────────────────────────────────────────────
  async listarRoles() {
    const filas = await consultarTodos(
      this.db,
      `SELECT r.*, (SELECT COUNT(*) FROM panel_users u WHERE u.role_id = r.id) AS userCount
       FROM panel_roles r
       ORDER BY CASE r.key WHEN 'principal' THEN 0 WHEN 'admin' THEN 1 WHEN 'user' THEN 2 ELSE 3 END, r.id`
    )
    return (filas || []).map((fila) => ({
      ...fila,
      permissions: parsearPermisos(fila.permissions),
    }))
  }

  async obtenerRol(id) {
    const fila = await consultarUno(this.db, 'SELECT * FROM panel_roles WHERE id = ?', [Number(id)])
    return fila ? { ...fila, permissions: parsearPermisos(fila.permissions) } : null
  }

  async obtenerRolPorKey(key) {
    const fila = await consultarUno(this.db, 'SELECT * FROM panel_roles WHERE key = ? COLLATE NOCASE', [String(key)])
    return fila ? { ...fila, permissions: parsearPermisos(fila.permissions) } : null
  }

  async crearRol({ key, name, description = null, scope = 'admin', permissions = [] }) {
    const ahora = Date.now()
    const { lastID } = await ejecutar(
      this.db,
      `INSERT INTO panel_roles (key, name, description, scope, permissions, system, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [String(key), String(name), description || null, scope === 'user' ? 'user' : 'admin',
        JSON.stringify(Array.isArray(permissions) ? permissions : []), ahora, ahora]
    )
    return this.obtenerRol(lastID)
  }

  async actualizarRol(id, { name, description, permissions } = {}) {
    const campos = []
    const valores = []
    if (name !== undefined) { campos.push('name = ?'); valores.push(String(name)) }
    if (description !== undefined) { campos.push('description = ?'); valores.push(description || null) }
    if (permissions !== undefined) { campos.push('permissions = ?'); valores.push(JSON.stringify(permissions || [])) }
    if (!campos.length) return false
    campos.push('updated_at = ?')
    valores.push(Date.now(), Number(id))
    const { changes } = await ejecutar(this.db, `UPDATE panel_roles SET ${campos.join(', ')} WHERE id = ?`, valores)
    return changes > 0
  }

  async eliminarRol(id) {
    const { changes } = await ejecutar(this.db, 'DELETE FROM panel_roles WHERE id = ? AND system = 0', [Number(id)])
    return changes > 0
  }

  async contarUsuariosConRol(id) {
    const fila = await consultarUno(this.db, 'SELECT COUNT(*) AS total FROM panel_users WHERE role_id = ?', [Number(id)])
    return Number(fila?.total || 0)
  }

  async asignarRolUsuario(id, roleId) {
    const rol = await this.obtenerRol(roleId)
    if (!rol) return false
    const { changes } = await ejecutar(
      this.db,
      'UPDATE panel_users SET role_id = ?, role = ? WHERE id = ?',
      [rol.id, rol.scope === 'admin' ? 'admin' : 'user', Number(id)]
    )
    return changes > 0
  }

  async establecerPrincipal(id) {
    const rol = await this.obtenerRolPorKey('principal')
    const admin = await this.obtenerRolPorKey('admin')
    if (!rol || !admin || !(await this.buscarUsuarioPorId(id))) return false
    // Retirar también el rol con '*': quitar solo la marca dejaba control total.
    await ejecutar(this.db,
      `UPDATE panel_users SET is_principal = 0, role = 'admin', role_id = ?
       WHERE id <> ? AND (is_principal = 1 OR role_id = ?)`,
      [admin.id, Number(id), rol.id]
    )
    const { changes } = await ejecutar(
      this.db,
      "UPDATE panel_users SET is_principal = 1, role = 'admin', role_id = ? WHERE id = ?",
      [rol.id, Number(id)]
    )
    return changes > 0
  }

  async contarPrincipales() {
    const fila = await consultarUno(this.db, 'SELECT COUNT(*) AS total FROM panel_users WHERE is_principal = 1')
    return Number(fila?.total || 0)
  }

  // ── Usuarios ──────────────────────────────────────────────────────────────
  async crearUsuario({ username, email = null, passwordHash, role = 'user', roleId = null, ip = null }) {
    const now = Date.now()
    let rol = roleId ? await this.obtenerRol(roleId) : await this.obtenerRolPorKey(role)
    if (!rol) rol = await this.obtenerRolPorKey('user')
    const rolLegacy = rol?.scope === 'admin' ? 'admin' : 'user'
    const { lastID } = await ejecutar(
      this.db,
      `INSERT INTO panel_users (username, email, password_hash, role, role_id, status, created_at, last_ip)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
      [username, email || null, passwordHash, rolLegacy, rol?.id || null, now, ip]
    )
    return this.buscarUsuarioPorId(lastID)
  }

  async buscarUsuarioPorNombre(username) {
    return consultarUno(
      this.db,
      `SELECT u.*, r.name AS role_name, r.scope AS role_scope, r.permissions AS role_permissions
       FROM panel_users u LEFT JOIN panel_roles r ON r.id = u.role_id
       WHERE u.username = ? COLLATE NOCASE`,
      [username]
    )
  }

  async buscarUsuarioPorEmail(email) {
    if (!email) return null
    return consultarUno(
      this.db,
      `SELECT u.*, r.name AS role_name, r.scope AS role_scope, r.permissions AS role_permissions
       FROM panel_users u LEFT JOIN panel_roles r ON r.id = u.role_id
       WHERE u.email = ? COLLATE NOCASE`,
      [email]
    )
  }

  async buscarUsuarioPorId(id) {
    return consultarUno(
      this.db,
      `SELECT u.*, r.name AS role_name, r.scope AS role_scope, r.permissions AS role_permissions
       FROM panel_users u LEFT JOIN panel_roles r ON r.id = u.role_id
       WHERE u.id = ?`,
      [Number(id)]
    )
  }

  async contarUsuarios() {
    const row = await consultarUno(this.db, 'SELECT COUNT(*) AS total FROM panel_users')
    return Number(row?.total || 0)
  }

  async contarAdmins() {
    const row = await consultarUno(this.db, "SELECT COUNT(*) AS total FROM panel_users WHERE role = 'admin' AND status = 'active'")
    return Number(row?.total || 0)
  }

  async listarUsuarios({ query = '', limit = 50, offset = 0 } = {}) {
    // Búsqueda literal: se escapan los comodines LIKE (%, _) y se acota el largo.
    const texto = String(query || '').trim().slice(0, 100)
    const like = `%${texto.replace(/[\\%_]/g, (caracter) => `\\${caracter}`)}%`
    return consultarTodos(
      this.db,
      `SELECT u.id, u.username, u.email, u.role, u.role_id, u.is_principal,
              u.email_verified_at, u.status, u.created_at, u.last_login_at, u.last_ip,
              r.name AS role_name, r.scope AS role_scope, r.permissions AS role_permissions
       FROM panel_users u LEFT JOIN panel_roles r ON r.id = u.role_id
       WHERE u.username LIKE ? ESCAPE '\\' OR COALESCE(u.email, '') LIKE ? ESCAPE '\\'
       ORDER BY u.id DESC LIMIT ? OFFSET ?`,
      [like, like, Number(limit), Number(offset)]
    )
  }

  async actualizarEmailUsuario(id, email) {
    const { changes } = await ejecutar(
      this.db,
      'UPDATE panel_users SET email = ?, email_verified_at = NULL WHERE id = ?',
      [email || null, Number(id)]
    )
    return changes > 0
  }

  async marcarEmailVerificado(id, email = null) {
    const campos = ['email_verified_at = ?']
    const valores = [Date.now()]
    if (email) {
      campos.push('email = ?')
      valores.push(String(email))
    }
    valores.push(Number(id))
    const { changes } = await ejecutar(this.db, `UPDATE panel_users SET ${campos.join(', ')} WHERE id = ?`, valores)
    return changes > 0
  }

  async verificarEmailActual(id, email) {
    const { changes } = await ejecutar(this.db,
      'UPDATE panel_users SET email_verified_at = ? WHERE id = ? AND email = ? COLLATE NOCASE',
      [Date.now(), Number(id), String(email)]
    )
    return changes > 0
  }

  async actualizarUsuario(id, { role, roleId, status, passwordHash } = {}) {
    const campos = []
    const valores = []
    if (roleId !== undefined) {
      const rol = roleId === null ? null : await this.obtenerRol(roleId)
      if (rol) {
        campos.push('role_id = ?', 'role = ?')
        valores.push(rol.id, rol.scope === 'admin' ? 'admin' : 'user')
      }
    }
    if (role !== undefined) { campos.push('role = ?'); valores.push(role) }
    if (status !== undefined) { campos.push('status = ?'); valores.push(status) }
    if (passwordHash !== undefined) { campos.push('password_hash = ?'); valores.push(passwordHash) }
    if (!campos.length) return false
    valores.push(Number(id))
    const { changes } = await ejecutar(this.db, `UPDATE panel_users SET ${campos.join(', ')} WHERE id = ?`, valores)
    return changes > 0
  }

  async registrarLogin(id, ip) {
    await ejecutar(this.db, 'UPDATE panel_users SET last_login_at = ?, last_ip = ? WHERE id = ?', [Date.now(), ip || null, Number(id)])
  }

  async eliminarUsuario(id) {
    const { changes } = await ejecutar(this.db, 'DELETE FROM panel_users WHERE id = ?', [Number(id)])
    return changes > 0
  }

  // ── Sesiones web (cookies) ────────────────────────────────────────────────
  async crearSesionWeb({ tokenHash, userId, csrfToken, expiresAt, ip, userAgent, impersonatedBy = null }) {
    await ejecutar(
      this.db,
      `INSERT INTO panel_web_sessions (token_hash, user_id, csrf_token, created_at, expires_at, ip, user_agent, impersonated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tokenHash, Number(userId), csrfToken, Date.now(), Number(expiresAt), ip || null, userAgent || null,
        impersonatedBy === null ? null : Number(impersonatedBy)]
    )
  }

  async obtenerSesionWeb(tokenHash) {
    return consultarUno(
      this.db,
      `SELECT s.token_hash, s.csrf_token, s.expires_at, s.impersonated_by,
              u.id, u.username, u.email, u.role, u.role_id, u.is_principal,
              u.email_verified_at, u.status,
              r.name AS role_name, r.scope AS role_scope, r.permissions AS role_permissions,
              a.username AS impersonated_by_username
       FROM panel_web_sessions s
       JOIN panel_users u ON u.id = s.user_id
       LEFT JOIN panel_roles r ON r.id = u.role_id
       LEFT JOIN panel_users a ON a.id = s.impersonated_by
       WHERE s.token_hash = ?`,
      [tokenHash]
    )
  }

  async eliminarSesionWeb(tokenHash) {
    await ejecutar(this.db, 'DELETE FROM panel_web_sessions WHERE token_hash = ?', [tokenHash])
  }

  async eliminarSesionesUsuario(userId) {
    await ejecutar(this.db, 'DELETE FROM panel_web_sessions WHERE user_id = ?', [Number(userId)])
  }

  async limpiarSesionesExpiradas() {
    const { changes } = await ejecutar(this.db, 'DELETE FROM panel_web_sessions WHERE expires_at < ?', [Date.now()])
    return changes
  }

  // ── Códigos de correo (verificación y recuperación) ──────────────────────
  async crearTokenCorreo({ userId, email, purpose, codeHash, expiresAt, ip = null }) {
    const ahora = Date.now()
    await ejecutar(
      this.db,
      'UPDATE panel_email_tokens SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL',
      [ahora, Number(userId), String(purpose)]
    )
    const { lastID } = await ejecutar(
      this.db,
      `INSERT INTO panel_email_tokens
         (user_id, email, purpose, code_hash, attempts, created_at, expires_at, ip)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
      [Number(userId), String(email).toLowerCase(), String(purpose), String(codeHash), ahora, Number(expiresAt), ip || null]
    )
    return consultarUno(this.db, 'SELECT * FROM panel_email_tokens WHERE id = ?', [lastID])
  }

  async obtenerTokenCorreo({ userId, email, purpose }) {
    return consultarUno(
      this.db,
      `SELECT * FROM panel_email_tokens
       WHERE user_id = ? AND email = ? COLLATE NOCASE AND purpose = ? AND used_at IS NULL
       ORDER BY id DESC LIMIT 1`,
      [Number(userId), String(email).toLowerCase(), String(purpose)]
    )
  }

  async incrementarIntentosTokenCorreo(id) {
    const { changes } = await ejecutar(
      this.db,
      'UPDATE panel_email_tokens SET attempts = attempts + 1 WHERE id = ?',
      [Number(id)]
    )
    return changes > 0
  }

  async marcarTokenCorreoUsado(id) {
    const { changes } = await ejecutar(
      this.db,
      'UPDATE panel_email_tokens SET used_at = ? WHERE id = ?',
      [Date.now(), Number(id)]
    )
    return changes > 0
  }

  async consumirTokenCorreo(id, maxAttempts = 5) {
    const now = Date.now()
    const { changes } = await ejecutar(this.db,
      `UPDATE panel_email_tokens SET used_at = ?
       WHERE id = ? AND used_at IS NULL AND expires_at >= ? AND attempts < ?`,
      [now, Number(id), now, maxAttempts]
    )
    return changes === 1
  }

  async invalidarTokensCorreo(userId, purpose = null) {
    if (purpose) {
      await ejecutar(
        this.db,
        'UPDATE panel_email_tokens SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL',
        [Date.now(), Number(userId), String(purpose)]
      )
    } else {
      await ejecutar(
        this.db,
        'UPDATE panel_email_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL',
        [Date.now(), Number(userId)]
      )
    }
  }

  async contarTokensCorreo({ userId, purpose, since }) {
    const fila = await consultarUno(
      this.db,
      `SELECT COUNT(*) AS total FROM panel_email_tokens
       WHERE user_id = ? AND purpose = ? AND created_at >= ?`,
      [Number(userId), String(purpose), Number(since)]
    )
    return Number(fila?.total || 0)
  }

  async limpiarTokensCorreo(olderThan) {
    const { changes } = await ejecutar(
      this.db,
      'DELETE FROM panel_email_tokens WHERE created_at < ?',
      [Number(olderThan)]
    )
    return changes
  }

  // Retención de auditoría: se invoca desde el mantenimiento periódico.
  async limpiarAuditoria(olderThan) {
    const { changes } = await ejecutar(
      this.db,
      'DELETE FROM panel_audit WHERE created_at < ?',
      [Number(olderThan)]
    )
    return changes
  }

  // ── Bots / sesiones vinculadas ────────────────────────────────────────────
  async upsertBot({ userId, phone, folder, label = null, status = 'linked', linkedAt = null, linkedIp = null }) {
    const now = Date.now()
    await ejecutar(
      this.db,
      `INSERT INTO panel_bots (phone, user_id, folder, label, status, linked_at, last_seen_at, created_at, linked_ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(phone) DO UPDATE SET
         user_id = excluded.user_id,
         folder = excluded.folder,
         label = COALESCE(excluded.label, panel_bots.label),
         status = excluded.status,
         linked_at = COALESCE(excluded.linked_at, panel_bots.linked_at),
         last_seen_at = excluded.last_seen_at,
         linked_ip = COALESCE(excluded.linked_ip, panel_bots.linked_ip)`,
      [phone, Number(userId), folder, label, status, linkedAt || now, now, now, linkedIp || null]
    )
    return this.obtenerBotPorPhone(phone)
  }

  async contarBotsUsuario(userId, exceptPhone = null) {
    const condiciones = ['user_id = ?']
    const valores = [Number(userId)]
    if (exceptPhone) {
      condiciones.push('phone <> ?')
      valores.push(String(exceptPhone))
    }
    const row = await consultarUno(
      this.db,
      `SELECT COUNT(*) AS total FROM panel_bots WHERE ${condiciones.join(' AND ')}`,
      valores
    )
    return Number(row?.total || 0)
  }

  /** Cuentas vinculadas desde la misma IP (límite anti-abuso). */
  async contarBotsPorIp(ip, exceptPhone = null) {
    if (!ip) return 0
    const condiciones = ['linked_ip = ?']
    const valores = [String(ip)]
    if (exceptPhone) {
      condiciones.push('phone <> ?')
      valores.push(String(exceptPhone))
    }
    const row = await consultarUno(
      this.db,
      `SELECT COUNT(*) AS total FROM panel_bots WHERE ${condiciones.join(' AND ')}`,
      valores
    )
    return Number(row?.total || 0)
  }

  async listarIpsVinculados() {
    const filas = await consultarTodos(
      this.db,
      `SELECT linked_ip AS ip, COUNT(*) AS total FROM panel_bots
       WHERE linked_ip IS NOT NULL AND linked_ip <> ''
       GROUP BY linked_ip ORDER BY total DESC`
    )
    return filas || []
  }

  async obtenerBotPorPhone(phone) {
    return consultarUno(this.db, 'SELECT * FROM panel_bots WHERE phone = ?', [String(phone)])
  }

  async listarBotsUsuario(userId) {
    return consultarTodos(this.db, 'SELECT * FROM panel_bots WHERE user_id = ? ORDER BY created_at DESC', [Number(userId)])
  }

  async listarBots() {
    return consultarTodos(
      this.db,
      `SELECT b.*, u.username
       FROM panel_bots b JOIN panel_users u ON u.id = b.user_id
       ORDER BY b.created_at DESC`
    )
  }

  async contarBots() {
    const row = await consultarUno(this.db, 'SELECT COUNT(*) AS total FROM panel_bots')
    return Number(row?.total || 0)
  }

  async actualizarBot(phone, { status, label, lastSeenAt } = {}) {
    const campos = []
    const valores = []
    if (status !== undefined) { campos.push('status = ?'); valores.push(status) }
    if (label !== undefined) { campos.push('label = ?'); valores.push(label) }
    if (lastSeenAt !== undefined) { campos.push('last_seen_at = ?'); valores.push(lastSeenAt) }
    if (!campos.length) return false
    valores.push(String(phone))
    const { changes } = await ejecutar(this.db, `UPDATE panel_bots SET ${campos.join(', ')} WHERE phone = ?`, valores)
    return changes > 0
  }

  async eliminarBot(phone) {
    const { changes } = await ejecutar(this.db, 'DELETE FROM panel_bots WHERE phone = ?', [String(phone)])
    return changes > 0
  }

  // ── Pairings (intentos de vinculación) ────────────────────────────────────
  async crearPairing({ id, userId, phone, ip, userAgent, expiresAt }) {
    await ejecutar(
      this.db,
      `INSERT INTO panel_pairings (id, user_id, phone, status, ip, user_agent, attempts, created_at, expires_at)
       VALUES (?, ?, ?, 'pending', ?, ?, 1, ?, ?)`,
      [id, Number(userId), String(phone), ip || null, userAgent || null, Date.now(), Number(expiresAt)]
    )
    return this.obtenerPairing(id)
  }

  async obtenerPairing(id) {
    return consultarUno(this.db, 'SELECT * FROM panel_pairings WHERE id = ?', [String(id)])
  }

  async actualizarPairing(id, { status, code, error, expiresAt, linkedAt } = {}) {
    const campos = []
    const valores = []
    if (status !== undefined) { campos.push('status = ?'); valores.push(status) }
    if (code !== undefined) { campos.push('code = ?'); valores.push(code) }
    if (error !== undefined) { campos.push('error = ?'); valores.push(error) }
    if (expiresAt !== undefined) { campos.push('expires_at = ?'); valores.push(Number(expiresAt)) }
    if (linkedAt !== undefined) { campos.push('linked_at = ?'); valores.push(Number(linkedAt)) }
    if (!campos.length) return false
    valores.push(String(id))
    const { changes } = await ejecutar(this.db, `UPDATE panel_pairings SET ${campos.join(', ')} WHERE id = ?`, valores)
    return changes > 0
  }

  async contarPairingsRecientes({ userId = null, phone = null, ip = null, since }) {
    const condiciones = ['created_at >= ?']
    const valores = [Number(since)]
    if (userId !== null) { condiciones.push('user_id = ?'); valores.push(Number(userId)) }
    if (phone !== null) { condiciones.push('phone = ?'); valores.push(String(phone)) }
    if (ip !== null) { condiciones.push('ip = ?'); valores.push(String(ip)) }
    const row = await consultarUno(
      this.db,
      `SELECT COUNT(*) AS total FROM panel_pairings WHERE ${condiciones.join(' AND ')}`,
      valores
    )
    return Number(row?.total || 0)
  }

  /** Intentos vivos que reservan una plaza aunque todavía no tengan creds. */
  async contarPairingsActivos() {
    const row = await consultarUno(
      this.db,
      "SELECT COUNT(*) AS total FROM panel_pairings WHERE status IN ('pending', 'code_ready') AND expires_at > ?",
      [Date.now()]
    )
    return Number(row?.total || 0)
  }

  /** Intento más antiguo de la ventana: sirve para saber cuánto falta. */
  async primerPairingReciente({ userId = null, ip = null, since }) {
    const condiciones = ['created_at >= ?']
    const valores = [Number(since)]
    if (userId !== null) { condiciones.push('user_id = ?'); valores.push(Number(userId)) }
    if (ip !== null) { condiciones.push('ip = ?'); valores.push(String(ip)) }
    const row = await consultarUno(
      this.db,
      `SELECT MIN(created_at) AS primero FROM panel_pairings WHERE ${condiciones.join(' AND ')}`,
      valores
    )
    return Number(row?.primero || 0) || null
  }

  async pairingsRecientes(limit = 50) {
    return consultarTodos(
      this.db,
      `SELECT p.*, u.username FROM panel_pairings p
       LEFT JOIN panel_users u ON u.id = p.user_id
       ORDER BY p.created_at DESC LIMIT ?`,
      [Number(limit)]
    )
  }

  async limpiarPairingsAntiguos({ olderThan }) {
    const { changes } = await ejecutar(
      this.db,
      "DELETE FROM panel_pairings WHERE created_at < ? AND status IN ('expired', 'error', 'cancelled')",
      [Number(olderThan)]
    )
    return changes
  }

  // ── Auditoría ─────────────────────────────────────────────────────────────
  async registrarAuditoria({ userId = null, action, ip = null, meta = null }) {
    await ejecutar(
      this.db,
      'INSERT INTO panel_audit (user_id, action, ip, meta, created_at) VALUES (?, ?, ?, ?, ?)',
      [userId === null ? null : Number(userId), String(action), ip || null, meta ? JSON.stringify(meta) : null, Date.now()]
    )
  }

  async listarAuditoria({ limit = 100, offset = 0 } = {}) {
    return consultarTodos(
      this.db,
      `SELECT a.*, u.username FROM panel_audit a
       LEFT JOIN panel_users u ON u.id = a.user_id
       ORDER BY a.id DESC LIMIT ? OFFSET ?`,
      [Number(limit), Number(offset)]
    )
  }

  // ── Meta / ajustes simples ────────────────────────────────────────────────
  async obtenerMeta(key) {
    const row = await consultarUno(this.db, 'SELECT value FROM panel_meta WHERE key = ?', [String(key)])
    return row ? row.value : null
  }

  async establecerMeta(key, value) {
    await ejecutar(
      this.db,
      `INSERT INTO panel_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [String(key), value === null ? null : String(value)]
    )
  }

  /** Ajuste numérico (0 = sin límite). */
  async obtenerAjusteNumerico(key, porDefecto = 0) {
    const valor = await this.obtenerMeta(key)
    const numero = Number.parseInt(valor, 10)
    if (!Number.isFinite(numero) || numero < 0) return porDefecto
    return numero
  }

  /** Ajuste numérico sin valor por defecto: null si no está configurado. */
  async obtenerAjusteNumericoOpcional(key) {
    const valor = await this.obtenerMeta(key)
    if (valor === null || valor === undefined || valor === '') return null
    const numero = Number.parseInt(valor, 10)
    if (!Number.isFinite(numero) || numero < 0) return null
    return numero
  }

  async establecerAjusteNumerico(key, valor) {
    const numero = Math.floor(Number(valor))
    if (!Number.isFinite(numero) || numero < 0) {
      throw new Error('El valor debe ser 0 (sin límite) o un número mayor.')
    }
    await this.establecerMeta(key, numero)
    return numero
  }

  // ── Comunidades de WhatsApp ──────────────────────────────────────────────
  async crearComunidad({ name, link, description = null, createdBy = null }) {
    const { lastID } = await ejecutar(
      this.db,
      `INSERT INTO panel_communities (name, link, description, created_by, active, created_at)
       VALUES (?, ?, ?, ?, 1, ?)`,
      [String(name), String(link), description || null, createdBy === null ? null : Number(createdBy), Date.now()]
    )
    return this.obtenerComunidad(lastID)
  }

  async obtenerComunidad(id) {
    return consultarUno(
      this.db,
      `SELECT c.*, u.username AS created_by_username
       FROM panel_communities c
       LEFT JOIN panel_users u ON u.id = c.created_by
       WHERE c.id = ?`,
      [Number(id)]
    )
  }

  async listarComunidades({ onlyActive = false } = {}) {
    const donde = onlyActive ? 'WHERE c.active = 1' : ''
    return consultarTodos(
      this.db,
      `SELECT c.*, u.username AS created_by_username
       FROM panel_communities c
       LEFT JOIN panel_users u ON u.id = c.created_by
       ${donde}
       ORDER BY c.active DESC, c.id DESC`
    )
  }

  async actualizarComunidad(id, { name, link, description, active } = {}) {
    const campos = []
    const valores = []
    if (name !== undefined) { campos.push('name = ?'); valores.push(String(name)) }
    if (link !== undefined) { campos.push('link = ?'); valores.push(String(link)) }
    if (description !== undefined) { campos.push('description = ?'); valores.push(description || null) }
    if (active !== undefined) { campos.push('active = ?'); valores.push(active ? 1 : 0) }
    if (!campos.length) return false
    valores.push(Number(id))
    const { changes } = await ejecutar(this.db, `UPDATE panel_communities SET ${campos.join(', ')} WHERE id = ?`, valores)
    return changes > 0
  }

  async eliminarComunidad(id) {
    const { changes } = await ejecutar(this.db, 'DELETE FROM panel_communities WHERE id = ?', [Number(id)])
    return changes > 0
  }
}
