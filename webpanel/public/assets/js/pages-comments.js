/* Sala de comentarios: conversaciones, respuestas e imágenes en tiempo real. */
import { api } from './api.js'
import {
  content, fmtRelative, h, icon, initials, openModal, setPage, showToast, state, updateNavBadges,
} from './core.js'

function comentarioPorId(id) {
  return state.comments.find((item) => String(item.id) === String(id))
}

function comentarioHTML(item) {
  const parent = item.parentId ? comentarioPorId(item.parentId) : null
  const contenido = item.deleted
    ? '<span class="comment-deleted">Mensaje eliminado</span>'
    : `${item.text ? `<div class="comment-text">${h(item.text).replace(/\n/g, '<br>')}</div>` : ''}${item.image ? `<button type="button" class="comment-image-button" data-action="comment-image" data-image-url="${h(item.image)}" aria-label="Abrir imagen"><img class="comment-image" src="${h(item.image)}" alt="Imagen adjunta" loading="lazy"></button>` : ''}`
  const menu = item.canModerate && !item.deleted
    ? `<div class="comment-menu"><button class="icon-btn sm" data-action="comment-menu" data-comment-id="${item.id}" aria-label="Acciones del comentario" title="Más acciones">•••</button></div>`
    : ''
  return `<article class="comment-row${item.deleted ? ' is-deleted' : ''}${Number(item.userId) === Number(state.user?.id) ? ' is-own' : ''}" data-comment-id="${item.id}">
    <div class="comment-avatar">${initials(item.username)}</div>
    <div class="comment-bubble">
      <div class="comment-meta"><b>${h(item.username)}${item.verifiedAuthor ? '<span class="comment-verified" title="Administrador verificado" aria-label="Administrador verificado">✓</span>' : ''}</b><span>${h(fmtRelative(item.createdAt))}</span>${item.authorBlocked ? '<span class="badge danger comment-badge">bloqueado</span>' : ''}${menu}</div>
      ${parent ? `<div class="comment-reply-context"><b>En respuesta a ${h(parent.username)}</b><span>${h(parent.text || 'Imagen')}</span></div>` : ''}
      ${contenido}
      ${!item.deleted ? `<div class="comment-actions"><button class="btn btn-ghost btn-xs" data-action="comment-reply" data-comment-id="${item.id}">${icon('arrowRight')} Responder</button></div>` : ''}
      ${item.canModerate && !item.deleted ? `<div class="comment-moderation" id="comment-menu-${item.id}" hidden><button data-action="comment-delete" data-comment-id="${item.id}">${icon('trash')} Eliminar</button><button data-action="comment-block" data-user-id="${item.userId}" data-username="${h(item.username)}">${icon('lock')} Bloquear chat</button></div>` : ''}
    </div>
  </article>`
}

function renderList() {
  const list = document.getElementById('comments-list')
  if (!list) return
  list.innerHTML = state.comments.length
    ? state.comments.map(comentarioHTML).join('')
    : `<div class="comments-empty">${icon('message')}<b>Aún no hay comentarios</b><span>Inicia la conversación con la comunidad.</span></div>`
  list.scrollTop = list.scrollHeight
}

function composerHTML() {
  const meta = state.commentsMeta || {}
  if (!state.user?.emailVerified) return `<div class="comments-locked">${icon('mail')}<div><b>Verifica tu correo para comentar.</b><span>La sala está disponible para leer, pero publicar requiere una cuenta verificada.</span></div><a class="btn btn-secondary btn-sm" href="#/account">Verificar correo</a></div>`
  if (meta.blocked) return `<div class="comments-locked danger">${icon('lock')}<div><b>Tu acceso a comentarios está bloqueado.</b><span>Si crees que es un error, contacta con la administración.</span></div></div>`
  const reply = state.commentsReply
  return `<form id="comment-form" class="comment-composer">
    ${reply ? `<div class="replying"><span>Respondiendo a <b>${h(reply.username)}</b></span><button type="button" class="icon-btn sm" data-action="comment-cancel-reply" aria-label="Cancelar respuesta">${icon('x')}</button></div>` : ''}
    <textarea name="text" maxlength="2000" rows="2" placeholder="Escribe un comentario…" aria-label="Comentario"></textarea>
    <div class="composer-tools"><label class="btn btn-ghost btn-sm" title="Adjuntar imagen">${icon('image')} Imagen<input name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden></label><span id="comment-file-name" class="muted tiny"></span><button class="btn btn-primary" type="submit">Enviar ${icon('arrowRight')}</button></div>
  </form>`
}

export async function renderComments() {
  setPage('Comentarios', 'Conversación de la comunidad')
  state.commentsUnread = 0
  updateNavBadges()
  content(`<div class="comments-page"><div class="page-head"><div><h2>Comentarios</h2><p>Conversación de la comunidad</p></div></div><div class="comments-card"><div id="comments-list" class="comments-list"><div class="loading">Cargando…</div></div><div id="comments-composer"></div></div></div>`)
  try {
    const data = await api.get('/api/comments')
    state.comments = data.comments || []
    state.commentsMeta = data
    renderList()
    const composer = document.getElementById('comments-composer')
    if (composer) composer.innerHTML = composerHTML()
    iniciarStream()
  } catch (error) {
    content(`<div class="error-page"><h2>No se pudo cargar la sala</h2><p>${h(error.message)}</p></div>`)
  }
}

function iniciarStream() {
  state.commentsStream?.close()
  const stream = new EventSource('/api/comments/stream')
  state.commentsStream = stream
  stream.addEventListener('comments', (event) => {
    let payload
    try { payload = JSON.parse(event.data) } catch { return }
    if (payload.type === 'created' && payload.comment) {
      if (!state.comments.some((item) => String(item.id) === String(payload.comment.id))) state.comments.push(payload.comment)
      if (state.route.parts[0] !== 'comments') { state.commentsUnread++; updateNavBadges() }
    } else if (payload.type === 'deleted') {
      const item = comentarioPorId(payload.commentId)
      if (item) { item.deleted = true; item.text = ''; item.image = null }
    } else if (payload.type === 'user_block' && Number(payload.userId) === Number(state.user.id)) {
      state.commentsMeta.blocked = payload.blocked
      const composer = document.getElementById('comments-composer')
      if (composer) composer.innerHTML = composerHTML()
    }
    renderList()
  })
  stream.onerror = () => { stream.close(); if (state.commentsStream === stream) state.commentsStream = null }
}

export async function submitComment(form) {
  const text = form.elements.text.value.trim()
  const file = form.elements.image.files?.[0]
  let image
  if (file) {
    if (file.size > 2 * 1024 * 1024) return showToast('La imagen no puede superar 2 MB.', 'error')
    try {
      image = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
    } catch {
      return showToast('No se pudo leer la imagen.', 'error')
    }
  }
  try {
    await api.post('/api/comments', { text, image, parentId: state.commentsReply?.id || null })
    state.commentsReply = null
    form.reset()
    const composer = document.getElementById('comments-composer')
    if (composer) composer.innerHTML = composerHTML()
  } catch (error) { showToast(error.message, 'error') }
}

export function toggleCommentMenu(id) {
  const menu = document.getElementById(`comment-menu-${id}`)
  if (menu) menu.hidden = !menu.hidden
}

export function openCommentImage(url) {
  if (!url) return
  openModal({
    title: 'Imagen',
    body: `<div class="comment-image-preview"><img src="${h(url)}" alt="Imagen adjunta ampliada"></div>`,
    wide: true,
  })
}

export function replyToComment(id) {
  const item = comentarioPorId(id)
  if (!item) return
  state.commentsReply = item
  const composer = document.getElementById('comments-composer')
  if (composer) { composer.innerHTML = composerHTML(); composer.querySelector('textarea')?.focus() }
}

export async function deleteComment(id) {
  if (!confirm('¿Eliminar este comentario?')) return
  try { await api.del(`/api/comments/${encodeURIComponent(id)}`); showToast('Comentario eliminado.', 'success') } catch (error) { showToast(error.message, 'error') }
}

export async function blockCommentUser(userId, username) {
  if (!confirm(`¿Bloquear a ${username} para que no pueda comentar?`)) return
  try { await api.post(`/api/comments/users/${encodeURIComponent(userId)}/block`, {}); showToast('Usuario bloqueado del chat.', 'success') } catch (error) { showToast(error.message, 'error') }
}
