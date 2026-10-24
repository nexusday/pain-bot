/* Pain Panel — rutas admin: comunidades */
import { SIN_RUTA } from './http.js'

export function crearRutasAdminGestion(ctx) {
  const {
    HttpError, json, leerJson, puede, requerirAdmin, requerirCsrf, requerirPermiso, requerirUsuario, store, verificarOrigen,
  } = ctx

  return async function rutasAdminGestion({ req, res, url, pathname, seg, metodo, ip }) {
    // ── Administración ────────────────────────────────────────────────────
    if (seg[0] === 'api' && seg[1] === 'admin') {
      const sesion = await requerirUsuario(req)
      requerirAdmin(sesion)
      res.hideUserIps = !puede(sesion, 'admin.users.ip')
      if (!['GET', 'HEAD', 'OPTIONS'].includes(metodo)) {
        requerirCsrf(req, sesion)
        verificarOrigen(req)
      }

      if (seg[2] === 'communities' && metodo === 'GET') {
        requerirPermiso(sesion, 'admin.communities')
        const comunidades = await store.listarComunidades()
        return json(res, 200, { communities: comunidades })
      }

      if (seg[2] === 'communities' && metodo === 'POST') {
        requerirPermiso(sesion, 'admin.communities.edit')
        const body = await leerJson(req)
        const name = String(body.name || '').trim()
        const link = String(body.link || '').trim()
        if (name.length < 2 || name.length > 80) {
          throw new HttpError(400, 'El nombre debe tener entre 2 y 80 caracteres.', 'invalid_name')
        }
        if (!/^https?:\/\/.+/i.test(link)) {
          throw new HttpError(400, 'El enlace debe empezar con http:// o https://', 'invalid_link')
        }
        const description = String(body.description || '').trim().slice(0, 300) || null
        const comunidad = await store.crearComunidad({ name, link, description, createdBy: sesion.id })
        await store.registrarAuditoria({
          userId: sesion.id,
          action: 'admin.community_create',
          ip,
          meta: { name, link },
        })
        return json(res, 201, { community: comunidad })
      }

      if (seg[2] === 'communities' && seg[3] && metodo === 'PATCH') {
        requerirPermiso(sesion, 'admin.communities.edit')
        const id = Number(seg[3])
        const existente = await store.obtenerComunidad(id)
        if (!existente) throw new HttpError(404, 'Comunidad no encontrada.', 'not_found')
        const body = await leerJson(req)
        const cambios = {}
        if (body.name !== undefined) {
          const name = String(body.name || '').trim()
          if (name.length < 2 || name.length > 80) {
            throw new HttpError(400, 'El nombre debe tener entre 2 y 80 caracteres.', 'invalid_name')
          }
          cambios.name = name
        }
        if (body.link !== undefined) {
          const link = String(body.link || '').trim()
          if (!/^https?:\/\/.+/i.test(link)) {
            throw new HttpError(400, 'El enlace debe empezar con http:// o https://', 'invalid_link')
          }
          cambios.link = link
        }
        if (body.description !== undefined) cambios.description = String(body.description || '').trim().slice(0, 300) || null
        if (body.active !== undefined) cambios.active = body.active === true || body.active === 1
        await store.actualizarComunidad(id, cambios)
        await store.registrarAuditoria({
          userId: sesion.id,
          action: 'admin.community_update',
          ip,
          meta: { id, campos: Object.keys(cambios) },
        })
        return json(res, 200, { ok: true, community: await store.obtenerComunidad(id) })
      }

      if (seg[2] === 'communities' && seg[3] && metodo === 'DELETE') {
        requerirPermiso(sesion, 'admin.communities.edit')
        const id = Number(seg[3])
        const existente = await store.obtenerComunidad(id)
        if (!existente) throw new HttpError(404, 'Comunidad no encontrada.', 'not_found')
        await store.eliminarComunidad(id)
        await store.registrarAuditoria({
          userId: sesion.id,
          action: 'admin.community_delete',
          ip,
          meta: { id, name: existente.name },
        })
        return json(res, 200, { ok: true })
      }
    }
    return SIN_RUTA
  }
}
