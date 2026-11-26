/* Pain Panel — módulo handlers-user */
import { api } from './api.js'
import {
  closeModal,
  confirmModal,
  fmtPhone,
  h,
  hideFormError,
  hideFormSuccess,
  icon,
  isLinkRoute,
  navigate,
  openModal,
  setLoading,
  showFormError,
  showFormSuccess,
  showToast,
  state,
  stopTimers,
} from './core.js'
import { renderAdmin } from './pages-admin.js'
import { renderAccount, renderLinkPage } from './pages-user.js'
import { route } from './shell.js'

/* ── Handlers de vinculación ────────────────────────────────────────────── */
export async function handleStartLink(form) {
  const submit = form.querySelector('button[type="submit"]')
  const phoneInput = form.querySelector('[name="phone"]')
  const forceInput = form.querySelector('[name="force"]')
  const serverInput = form.querySelector('[name="serverId"]')
  const phone = String(phoneInput?.value || '').replace(/\D/g, '')
  const force = Boolean(forceInput?.checked)
  const serverId = serverInput?.value ? Number(serverInput.value) : null

  hideFormError(form)
  if (phone.length < 8 || phone.length > 15) {
    showFormError(form, 'Escribe el número con código de país (entre 8 y 15 dígitos).')
    return
  }

  setLoading(submit, true, 'Generando código…')
  try {
    const data = await api.post('/api/bots/link', { phone, force, serverId })
    state.pairing = data.pairing || null
    state.pairingCode = data.code || data.pairing?.code || null
    state.linkPrefill = null
    showToast(data.code ? 'Código generado. Ingrésalo en WhatsApp.' : 'Vinculación iniciada.', 'success')
    renderLinkPage()
  } catch (error) {
    showFormError(form, error.message || 'No se pudo generar el código.')
    setLoading(submit, false)
    if (error.code === 'already_linked' && forceInput) forceInput.checked = true
  }
}

export async function handleLinkCancel() {
  const pairing = state.pairing
  if (!pairing?.id) {
    resetLinkFlow()
    return
  }
  try {
    const data = await api.post(`/api/bots/link/${encodeURIComponent(pairing.id)}/cancel`, {})
    state.pairing = data.pairing || null
    stopTimers()
    renderLinkPage()
    showToast('Vinculación cancelada.', 'info')
  } catch (error) {
    showToast(error.message || 'No se pudo cancelar.', 'error')
  }
}

export async function handleLinkRegenerate() {
  const pairing = state.pairing
  if (!pairing?.id) return
  try {
    const data = await api.post(`/api/bots/link/${encodeURIComponent(pairing.id)}/regenerate`, {})
    state.pairing = data.pairing || null
    state.pairingCode = data.code || data.pairing?.code || null
    stopTimers()
    renderLinkPage()
    showToast('Nuevo código generado.', 'success')
  } catch (error) {
    showToast(error.message || 'No se pudo regenerar el código.', 'error')
  }
}

export function resetLinkFlow() {
  stopTimers()
  state.pairing = null
  state.pairingCode = null
  state.linkPrefill = null
  if (isLinkRoute()) renderLinkPage()
  else navigate('/link')
}

export function handleBotRelink(phone) {
  stopTimers()
  state.pairing = null
  state.pairingCode = null
  state.linkPrefill = { phone, force: true }
  navigate('/link')
}

/* ── Handlers de bots ───────────────────────────────────────────────────── */
export function confirmDeleteBot(phone, label) {
  confirmModal({
    title: 'Eliminar sub-bot',
    message: `Se eliminará la sesión de <b>${h(label || fmtPhone(phone))}</b> (${h(fmtPhone(phone))}), se cerrarán sus credenciales y se olvidarán los ajustes guardados. Esta acción no se puede deshacer.`,
    confirmLabel: 'Eliminar sub-bot',
    onConfirm: async () => {
      await api.del(`/api/bots/${encodeURIComponent(phone)}`)
      state.pairing = null
      stopTimers()
      showToast('Sub-bot eliminado.', 'success')
      await route()
    },
  })
}

export function reconnectReason(reason) {
  const reasons = {
    'no-worker': 'El proceso del bot no tiene esa sesión disponible.',
    relink: 'Ese bot necesita re-vincularse desde la web.',
    pairing: 'La sesión se está vinculando ahora.',
    'no-creds': 'La sesión no tiene credenciales válidas.',
    timeout: 'La reconexión está tardando; revisa el estado en unos segundos.',
    invalid: 'La sesión no es válida.',
  }
  return reasons[reason] || 'No se pudo solicitar la reconexión.'
}

export async function reconnectBot(phone) {
  try {
    const result = await api.post(`/api/bots/${encodeURIComponent(phone)}/reconnect`, {})
    if (result.ok) {
      showToast('Reconexión solicitada al supervisor.', 'success')
      setTimeout(() => {
        if (state.user) route()
      }, 1600)
    } else {
      showToast(reconnectReason(result.reason), 'warn')
    }
  } catch (error) {
    showToast(error.message || 'No se pudo reconectar.', 'error')
  }
}

export async function handleRename(form) {
  const phone = form.dataset.phone
  const input = form.querySelector('[name="label"]')
  const label = String(input?.value || '').trim()
  hideFormError(form)
  try {
    await api.patch(`/api/bots/${encodeURIComponent(phone)}`, { label })
    closeModal()
    showToast('Nombre actualizado.', 'success')
    await route()
  } catch (error) {
    showFormError(form, error.message || 'No se pudo renombrar.')
  }
}

/* ── Handlers de cuenta ─────────────────────────────────────────────────── */
export async function handlePasswordChange(form) {
  const current = form.querySelector('[name="current"]')?.value || ''
  const password = form.querySelector('[name="password"]')?.value || ''
  const confirm = form.querySelector('[name="confirm"]')?.value || ''
  const submit = form.querySelector('button[type="submit"]')

  hideFormError(form)
  hideFormSuccess(form)
  if (password !== confirm) {
    showFormError(form, 'Las contraseñas nuevas no coinciden.')
    return
  }

  setLoading(submit, true, 'Actualizando…')
  try {
    const data = await api.post('/api/auth/password', { current, password })
    state.csrf = data.csrf
    form.reset()
    showFormSuccess(form, 'Contraseña actualizada. Las demás sesiones fueron cerradas.')
    showToast('Contraseña actualizada.', 'success')
  } catch (error) {
    showFormError(form, error.message || 'No se pudo cambiar la contraseña.')
  } finally {
    setLoading(submit, false)
  }
}

export async function handleEmailSave(form) {
  const email = form.querySelector('[name="email"]')?.value.trim() || ''
  const submit = form.querySelector('button[type="submit"]')

  hideFormError(form)
  hideFormSuccess(form)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showFormError(form, 'Escribe un correo válido.')
    return
  }

  setLoading(submit, true, 'Guardando…')
  try {
    const data = await api.patch('/api/account/email', { email })
    state.user = { ...state.user, ...(data.user || {}), email: data.user?.email || email }
    if (data.mailConfigured !== undefined) {
      state.config = { ...(state.config || {}), mailConfigured: data.mailConfigured }
    }
    renderAccount()
    if (data.emailSent) {
      showToast('Correo guardado. Te enviamos un código para verificarlo.', 'success')
    } else if (data.emailReason === 'mail_not_configured') {
      showToast('Correo guardado, pero el envío de correos aún no está configurado.', 'warn')
    } else {
      showToast('Correo guardado. Revisa tu bandeja para verificar la cuenta.', 'info')
    }
  } catch (error) {
    showFormError(form, error.message || 'No se pudo guardar el correo.')
    setLoading(submit, false)
  }
}

export async function handleEmailVerify(form) {
  const code = String(form.querySelector('[name="code"]')?.value || '').replace(/\D/g, '')
  const submit = form.querySelector('button[type="submit"]')
  hideFormError(form)
  hideFormSuccess(form)
  if (!/^\d{6}$/.test(code)) {
    showFormError(form, 'El código debe tener 6 dígitos.')
    return
  }
  setLoading(submit, true, 'Verificando…')
  try {
    const data = await api.post('/api/account/email/verify', { code })
    state.user = { ...state.user, ...(data.user || {}), emailVerified: true }
    renderAccount()
    showToast('Correo verificado. Tu cuenta está protegida.', 'success')
  } catch (error) {
    showFormError(form, error.message || 'No se pudo verificar el correo.')
  } finally {
    setLoading(submit, false)
  }
}

export async function handleEmailVerifyResend() {
  try {
    const data = await api.post('/api/account/email/verify/send', {})
    if (data.mailConfigured !== undefined) {
      state.config = { ...(state.config || {}), mailConfigured: data.mailConfigured }
    }
    if (data.alreadyVerified) {
      state.user = { ...state.user, emailVerified: true }
      renderAccount()
      showToast('Tu correo ya estaba verificado.', 'info')
      return
    }
    if (data.emailSent) showToast('Código reenviado. Revisa tu correo.', 'success')
    else showToast('No se pudo enviar el código. Avisa al administrador del panel.', 'warn')
  } catch (error) {
    showToast(error.message || 'No se pudo reenviar el código.', 'error')
  }
}

export async function handleProfileImageSave(form) {
  const file = form.querySelector('[name="image"]')?.files?.[0]
  if (!file) return showToast('Selecciona una imagen primero.', 'warn')
  if (file.size > 10 * 1024 * 1024) return showToast('La foto no puede superar 10 MB.', 'error')
  const submit = form.querySelector('button[type="submit"]')
  setLoading(submit, true, 'Guardando…')
  try {
    const image = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    const data = await api.post('/api/account/avatar', { image })
    state.user = { ...state.user, ...(data.user || {}) }
    renderAccount()
    document.querySelector('.user-avatar')?.replaceChildren(Object.assign(document.createElement('img'), { src: `${state.user.profileImage}?v=${Date.now()}`, alt: `Foto de ${state.user.username}` }))
    showToast('Foto de perfil actualizada.', 'success')
  } catch (error) { showToast(error.message || 'No se pudo guardar la foto.', 'error') }
  finally { setLoading(submit, false) }
}

export function handleProfileImageSelect(input) {
  const form = input.form
  const file = input.files?.[0]
  const status = form?.querySelector('#profile-image-status')
  const submit = form?.querySelector('button[type="submit"]')
  const preview = document.querySelector('.account-photo-preview')
  if (!file) {
    if (submit) submit.disabled = true
    if (status) status.textContent = 'Elige una imagen para ver la vista previa.'
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    if (submit) submit.disabled = true
    if (status) status.textContent = 'La imagen supera el límite de 10 MB.'
    return
  }
  if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.type)) {
    if (submit) submit.disabled = true
    if (status) status.textContent = 'Formato no válido. Usa JPG, PNG, WebP o GIF.'
    return
  }
  if (submit) submit.disabled = false
  if (status) status.textContent = `Cargando vista previa… ${file.name} · ${(file.size / (1024 * 1024)).toFixed(2)} MB`
  const reader = new FileReader()
  reader.onload = () => {
    if (preview) {
      preview.replaceChildren(Object.assign(document.createElement('img'), { src: String(reader.result), alt: 'Vista previa de la foto seleccionada' }))
    }
    if (status) status.textContent = `Seleccionada: ${file.name} · ${(file.size / (1024 * 1024)).toFixed(2)} MB`
  }
  reader.onerror = () => {
    if (submit) submit.disabled = true
    if (status) status.textContent = 'No se pudo generar la vista previa.'
  }
  reader.readAsDataURL(file)
}

export async function handleProfileImageRemove() {
  try {
    const data = await api.del('/api/account/avatar')
    state.user = { ...state.user, ...(data.user || {}), profileImage: null }
    renderAccount()
    const avatar = document.querySelector('.user-avatar')
    if (avatar) avatar.textContent = state.user.username.slice(0, 2).toUpperCase()
    showToast('Foto de perfil eliminada.', 'success')
  } catch (error) { showToast(error.message || 'No se pudo quitar la foto.', 'error') }
}

/* ── Handlers de las comunidades ────────────────────────────────────────── */
/* ── Mantenimiento: actualizar sin reiniciar ─────────────────────────────── */
export function esperaPanelYRecarga() {
  let intentos = 0
  const revisar = async () => {
    intentos += 1
    try {
      await api.get('/healthz')
      window.location.reload()
      return
    } catch {}
    if (intentos < 60) setTimeout(revisar, 1000)
    else showToast('El panel no volvió a responder. Recarga la página.', 'warn')
  }
  setTimeout(revisar, 1200)
}

/** Reinicio del proceso completo: corta el panel unos segundos. */
export function confirmarReinicioDelProceso() {
  confirmModal({
    title: 'Reiniciar el bot',
    message: 'El proceso se cierra y vuelve a arrancar automáticamente. <b>El panel se corta un par de segundos</b> y los sub-bots reconectan. ¿Seguimos?',
    confirmLabel: 'Reiniciar el bot',
    danger: false,
    onConfirm: async () => {
      await api.post('/api/main/restart', {})
      showToast('Reiniciando el bot…', 'info')
      esperarReinicio()
    },
  })
}

/**
 * Aplica los cambios del remoto SIN reiniciar el proceso: el bot recarga su
 * código y el panel se recarga a sí mismo (unos cientos de ms). Solo si cambió
 * `main.js` (que no se puede recargar en caliente) hay que reiniciar el
 * proceso, y eso sí corta el panel unos segundos.
 */
export async function aplicarCambiosEnCaliente() {
  const box = document.getElementById('update-result')
  const set = (texto) => { if (box) box.textContent = texto }
  set('Actualizando desde el remoto…')
  try {
    const data = await api.post('/api/admin/update', {})
    const commits = data.commits || []
    const lineas = []
    lineas.push(commits.length ? `${commits.length} commit(s) aplicados.` : 'Ya estaba al día.')
    if (data.cambiosLocalesConservados) lineas.push('Tus cambios locales se guardaron y se reaplicaron.')
    if (data.resumen?.handler) lineas.push('El bot recargó su código.')
    if (data.resumen?.plugins?.length) lineas.push(`${data.resumen.plugins.length} plugin(s) recargados.`)
    if (data.workers?.workers) lineas.push('El proceso del bot también recargó su código.')
    if (data.reinicioPendiente) {
      lineas.push('main.js cambió: hace falta reiniciar el proceso.')
      set(lineas.join(' '))
      showToast('Hay que reiniciar el proceso (main.js cambió).', 'warn')
      confirmarReinicioDelProceso()
      return
    }
    lineas.push('El panel se recarga solo en un momento (sin cortar la web).')
    set(lineas.join(' '))
    showToast('Actualización aplicada sin reiniciar.', 'success')
    esperaPanelYRecarga()
  } catch (error) {
    if (error.code === 'unsupported') {
      set('El proceso del bot tiene el código viejo: hay que reiniciarlo una vez.')
      showToast('El proceso tiene el código viejo: hay que reiniciar el bot una vez.', 'warn')
      confirmarReinicioDelProceso()
      return
    }
    set(`Error: ${error.message || 'no se pudo actualizar'}`)
    showToast(error.message || 'No se pudo actualizar.', 'error')
  }
}

export async function handleAdminUpdate() {
  await aplicarCambiosEnCaliente()
}

export async function handleAdminReload() {
  const box = document.getElementById('update-result')
  const set = (texto) => { if (box) box.textContent = texto }
  set('Recargando el código en caliente…')
  try {
    const data = await api.post('/api/admin/reload', {})
    const workers = data?.workers?.workers
    set(workers
      ? 'Código recargado (el proceso del bot también). El panel se recarga solo en un momento.'
      : 'Código recargado. El panel se recarga solo en un momento.')
    showToast('Código recargado.', 'success')
    esperaPanelYRecarga()
  } catch (error) {
    set(`Error: ${error.message || 'no se pudo recargar'}`)
    showToast(error.message || 'No se pudo recargar.', 'error')
  }
}

/* ── Handlers de las comunidades ────────────────────────────────────────── */
export function openCommunityModal(comunidad) {
  openModal({
    title: 'Editar comunidad',
    subtitle: comunidad.name,
    body: `<form id="community-edit-form" data-id="${comunidad.id}">
      <div class="form-error">${icon('alert')}<span></span></div>
      <div class="field">
        <label class="label" for="ced-name">Nombre</label>
        <input id="ced-name" name="name" class="input" maxlength="80" value="${h(comunidad.name || '')}" required />
      </div>
      <div class="field">
        <label class="label" for="ced-link">Enlace de invitación</label>
        <input id="ced-link" name="link" class="input" type="url" value="${h(comunidad.link || '')}" required />
        <div class="hint">El enlace al que entra la gente para unirse al grupo.</div>
      </div>
      <div class="field">
        <label class="label" for="ced-desc">Descripción</label>
        <textarea id="ced-desc" name="description" class="textarea" maxlength="300" placeholder="Avisos, soporte y novedades">${h(comunidad.description || '')}</textarea>
      </div>
    </form>`,
    footer: `<button class="btn btn-ghost" data-action="modal-close">Cancelar</button>
      <button class="btn btn-primary" type="submit" form="community-edit-form">${icon('check')} Guardar cambios</button>`,
  })
}

export async function handleCommunityEdit(form) {
  const id = form.dataset.id
  const name = String(form.querySelector('[name="name"]')?.value || '').trim()
  const link = String(form.querySelector('[name="link"]')?.value || '').trim()
  const description = String(form.querySelector('[name="description"]')?.value || '').trim()
  hideFormError(form)
  if (name.length < 2) {
    showFormError(form, 'El nombre debe tener al menos 2 caracteres.')
    return
  }
  if (!/^https?:\/\/.+/i.test(link)) {
    showFormError(form, 'El enlace debe empezar con http:// o https://')
    return
  }
  try {
    await api.patch(`/api/admin/communities/${encodeURIComponent(id)}`, { name, link, description: description || null })
    closeModal()
    showToast('Comunidad actualizada.', 'success')
    await renderAdmin('communities')
  } catch (error) {
    showFormError(form, error.message || 'No se pudo actualizar la comunidad.')
  }
}

export async function handleCommunitySave(form) {
  const name = String(form.querySelector('[name="name"]')?.value || '').trim()
  const link = String(form.querySelector('[name="link"]')?.value || '').trim()
  const description = String(form.querySelector('[name="description"]')?.value || '').trim()
  const submit = form.querySelector('button[type="submit"]')
  hideFormError(form)
  if (name.length < 2) {
    showFormError(form, 'Escribe el nombre de la comunidad.')
    return
  }
  if (!/^https?:\/\/.+/i.test(link)) {
    showFormError(form, 'El enlace debe empezar con http:// o https://')
    return
  }
  setLoading(submit, true, 'Guardando…')
  try {
    await api.post('/api/admin/communities', { name, link, description: description || null })
    form.reset()
    showToast('Comunidad creada.', 'success')
    await renderAdmin('communities')
  } catch (error) {
    showFormError(form, error.message || 'No se pudo crear la comunidad.')
    setLoading(submit, false)
  }
}

export async function toggleCommunity(id, active) {
  try {
    await api.patch(`/api/admin/communities/${encodeURIComponent(id)}`, { active: !active })
    showToast(active ? 'Comunidad ocultada.' : 'Comunidad visible.', 'success')
    await renderAdmin('communities')
  } catch (error) {
    showToast(error.message || 'No se pudo actualizar la comunidad.', 'error')
  }
}

export function confirmDeleteCommunity(id, name) {
  confirmModal({
    title: 'Eliminar comunidad',
    message: `Se eliminará <b>${h(name)}</b> de la lista del panel. Los usuarios ya unidos al grupo de WhatsApp seguirán dentro.`,
    confirmLabel: 'Eliminar comunidad',
    onConfirm: async () => {
      await api.del(`/api/admin/communities/${encodeURIComponent(id)}`)
      showToast('Comunidad eliminada.', 'success')
      await renderAdmin('communities')
    },
  })
}

/** Espera a que el proceso vuelva y recarga la página. */
export function esperarReinicio() {
  let intentos = 0
  const revisar = async () => {
    intentos += 1
    try {
      await api.get('/healthz')
      window.location.reload()
      return
    } catch {}
    if (intentos < 45) {
      setTimeout(revisar, 2000)
      return
    }
    showToast('El servidor todavía no responde. Recarga la página en unos segundos.', 'warn')
  }
  setTimeout(revisar, 2500)
}
