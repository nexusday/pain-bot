/* Comentarios públicos del panel: autenticados para leer, correo verificado para publicar. */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { SIN_RUTA } from './http.js'

const MAX_TEXT = 2000
const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
])

function mapearComentario(row, { canModerate = false } = {}) {
  if (!row) return null
  let permisos = []
  try { permisos = JSON.parse(String(row.role_permissions || '[]')) } catch {}
  const verifiedAuthor = Number(row.is_principal) === 1 || permisos.includes('admin.comments.verified')
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username || 'Usuario eliminado',
    parentId: row.parent_id || null,
    text: row.deleted_at ? '' : row.body,
    image: row.deleted_at || !row.image_file ? null : `/api/comments/${row.id}/media`,
    createdAt: row.created_at,
    deleted: Boolean(row.deleted_at),
    authorBlocked: Boolean(row.author_blocked),
    verifiedAuthor,
    canModerate,
  }
}

function parsearImagen(dataUrl) {
  if (!dataUrl) return null
  const match = String(dataUrl).match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([a-z0-9+/=\s]+)$/i)
  if (!match) throw new Error('La imagen debe ser JPG, PNG, WebP o GIF.')
  const mime = match[1].toLowerCase()
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64')
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('La imagen no puede superar 2 MB.')
  }
  const valido = match[1].toLowerCase() === 'image/jpeg'
    ? buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8
    : match[1].toLowerCase() === 'image/png'
      ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : match[1].toLowerCase() === 'image/gif'
        ? buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a'
        : buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  if (!valido) throw new Error('El contenido de la imagen no coincide con su formato.')
  return { mime, buffer, extension: IMAGE_TYPES.get(mime) }
}

export function crearRutasComentarios(ctx) {
  const {
    HttpError, config, json, leerJson, puede, requerirCsrf, requerirPermiso,
    requerirUsuario, store, verificarOrigen, suscribirComentarios, publicarComentario,
  } = ctx
  const mediaDir = path.join(config.dataDir, 'comments')

  function exigirCorreo(sesion) {
    if (!sesion.email_verified_at) {
      throw new HttpError(403, 'Verifica tu correo antes de comentar.', 'email_unverified')
    }
  }

  return async function rutasComentarios({ req, res, pathname, seg, metodo, ip }) {
    if (seg[0] !== 'api' || seg[1] !== 'comments') return SIN_RUTA
    const sesion = await requerirUsuario(req)
    const moderador = puede(sesion, 'admin.comments')

    if (pathname === '/api/comments/stream' && metodo === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-store',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      })
      res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`)
      const cancelar = suscribirComentarios(res, sesion.id)
      req.once('close', cancelar)
      return
    }

    if (!['GET', 'HEAD', 'OPTIONS'].includes(metodo)) {
      requerirCsrf(req, sesion)
      verificarOrigen(req)
    }

    if (seg.length === 2 && metodo === 'GET') {
      const before = new URL(req.url || '/', 'http://localhost').searchParams.get('before')
      const filas = await store.listarComentarios({ before: before ? Number(before) : null, limit: 100 })
      const bloqueado = await store.obtenerBloqueoComentario(sesion.id)
      return json(res, 200, {
        comments: filas.reverse().map((fila) => mapearComentario(fila, { canModerate: moderador })),
        blocked: Boolean(bloqueado),
        canModerate: moderador,
        canDelete: puede(sesion, 'admin.comments.delete'),
        canBlock: puede(sesion, 'admin.comments.block'),
      })
    }

    if (seg[2] && seg[3] === 'media' && metodo === 'GET') {
      const media = await store.obtenerMediaComentario(seg[2])
      if (!media?.file || !media.mime) throw new HttpError(404, 'Imagen no encontrada.', 'not_found')
      const archivo = path.resolve(mediaDir, path.basename(media.file))
      if (!archivo.startsWith(path.resolve(mediaDir) + path.sep)) throw new HttpError(404, 'Imagen no encontrada.', 'not_found')
      try {
        const contenido = await fs.promises.readFile(archivo)
        res.writeHead(200, { 'Content-Type': media.mime, 'Content-Length': contenido.length, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' })
        return res.end(contenido)
      } catch { throw new HttpError(404, 'Imagen no encontrada.', 'not_found') }
    }

    if (seg.length === 2 && metodo === 'POST') {
      exigirCorreo(sesion)
      const bloqueo = await store.obtenerBloqueoComentario(sesion.id)
      if (bloqueo) throw new HttpError(403, 'Tu acceso a comentarios está bloqueado.', 'comments_blocked')
      const body = await leerJson(req, 3 * 1024 * 1024)
      const text = String(body.text || '').trim()
      let imagen = null
      try { imagen = parsearImagen(body.image) } catch (error) {
        throw new HttpError(400, error.message || 'Imagen no válida.', 'invalid_image')
      }
      if (!text && !imagen) throw new HttpError(400, 'Escribe un mensaje o adjunta una imagen.', 'empty_comment')
      if (text.length > MAX_TEXT) throw new HttpError(400, `El mensaje no puede superar ${MAX_TEXT} caracteres.`, 'comment_too_long')
      let parentId = body.parentId ? Number(body.parentId) : null
      if (parentId) {
        const parent = await store.obtenerComentario(parentId)
        if (!parent || parent.deleted_at) throw new HttpError(400, 'La respuesta original ya no está disponible.', 'invalid_parent')
      }
      let imageFile = null
      if (imagen) {
        fs.mkdirSync(mediaDir, { recursive: true })
        imageFile = `${crypto.randomBytes(18).toString('hex')}.${imagen.extension}`
        await fs.promises.writeFile(path.join(mediaDir, imageFile), imagen.buffer, { flag: 'wx', mode: 0o600 })
      }
      const comentario = await store.crearComentario({ userId: sesion.id, parentId, body: text, imageFile, imageMime: imagen?.mime })
      const publico = mapearComentario(comentario, { canModerate: moderador })
      publicarComentario({ type: 'created', comment: publico })
      return json(res, 201, { comment: publico })
    }

    if (seg[2] === 'users' && seg[3] && seg[4] === 'block' && ['POST', 'DELETE'].includes(metodo)) {
      requerirPermiso(sesion, 'admin.comments.block')
      const userId = Number(seg[3])
      if (!Number.isInteger(userId) || userId < 1 || userId === Number(sesion.id)) {
        throw new HttpError(400, 'Usuario no válido para bloquear.', 'invalid_user')
      }
      if (metodo === 'DELETE') await store.desbloquearComentariosUsuario(userId)
      else {
        const body = await leerJson(req)
        await store.bloquearComentariosUsuario(userId, sesion.id, String(body.reason || '').trim().slice(0, 200) || null)
      }
      await store.registrarAuditoria({ userId: sesion.id, action: metodo === 'DELETE' ? 'admin.comment_unblock' : 'admin.comment_block', ip, meta: { userId } })
      publicarComentario({ type: 'user_block', userId, blocked: metodo !== 'DELETE' })
      return json(res, 200, { ok: true, blocked: metodo !== 'DELETE' })
    }

    if (seg[2] && metodo === 'DELETE') {
      requerirPermiso(sesion, 'admin.comments.delete')
      const id = Number(seg[2])
      const comentario = await store.obtenerComentario(id)
      if (!comentario) throw new HttpError(404, 'Comentario no encontrado.', 'not_found')
      await store.eliminarComentario(id, sesion.id)
      if (comentario.image_file) {
        await fs.promises.unlink(path.join(mediaDir, path.basename(comentario.image_file))).catch(() => {})
      }
      await store.registrarAuditoria({ userId: sesion.id, action: 'admin.comment_delete', ip, meta: { id } })
      publicarComentario({ type: 'deleted', commentId: id })
      return json(res, 200, { ok: true })
    }

    throw new HttpError(404, 'No encontrado.', 'not_found')
  }
}
