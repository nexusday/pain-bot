/* Pain Panel — módulo handlers-admin */
import { api } from './api.js'
import {
  closeModal,
  confirmModal,
  fmtPhone,
  h,
  hideFormError,
  hideFormSuccess,
  icon,
  isAdminRoute,
  navigate,
  openModal,
  setLoading,
  showFormError,
  showFormSuccess,
  showToast,
  state,
} from './core.js'
import { reconnectReason } from './handlers-user.js'
import { renderAdmin } from './pages-admin.js'
import { renderShell } from './shell.js'

/* ── Handlers del bot principal ─────────────────────────────────────────── */

export async function handleMainLink(form) {
  const input = form.querySelector('[name="phone"]')
  const submit = form.querySelector('button[type="submit"]')
  const phone = String(input?.value || '').replace(/\D/g, '')

  hideFormError(form)
  if (phone.length < 8 || phone.length > 15) {
    showFormError(form, 'Escribe el número con código de país (entre 8 y 15 dígitos).')
    return
  }

  setLoading(submit, true, 'Generando código…')
  try {
    const data = await api.post('/api/main/code', { phone })
    state.mainCode = data.code || null
    showToast('Código generado. Ingrésalo en WhatsApp.', 'success')
    await renderAdmin('principal')
  } catch (error) {
    showFormError(form, error.message || 'No se pudo generar el código.')
    setLoading(submit, false)
  }
}

export async function handleMainUnlink() {
  const main = state.main || {}
  const numero = main.phone ? fmtPhone(main.phone) : 'el bot principal'
  const caido = main.stale || !main.connected
  confirmModal({
    title: caido ? 'Quitar el número del principal' : 'Desvincular el bot principal',
    message: caido
      ? `Se borrará la sesión guardada de <b>${h(numero)}</b> y se levantará un principal limpio, listo para que vincules otro número. <b>No se reinicia el proceso</b> y los sub-bots no se tocan.`
      : `Se cerrará la sesión de <b>${h(numero)}</b> en WhatsApp y se borrarán sus credenciales del servidor. <b>El panel web sigue funcionando</b> y los sub-bots reconectan solos.`,
    confirmLabel: caido ? 'Quitar el número' : 'Desvincular',
    onConfirm: async () => {
      await api.post('/api/main/unlink', {})
      state.mainCode = null
      showToast('Listo. Ya puedes vincular otro número.', 'success')
      await renderAdmin('principal')
    },
  })
}

export function openRelinkModal() {
  openModal({
    title: 'Cambiar el número del principal',
    subtitle: 'Sin reiniciar el panel',
    body: `<form id="relink-form">
      <div class="form-error">${icon('alert')}<span></span></div>
      <div class="notice" style="margin-bottom:14px">${icon('info')}<div>Se cierra la sesión actual de WhatsApp y se genera un código para el número nuevo. <b>El panel web no se reinicia</b>: los usuarios que están dentro no se cortan.</div></div>
      <div class="field">
        <label class="label" for="relink-phone">Número de WhatsApp</label>
        <div class="input-icon">${icon('phone')}<input id="relink-phone" name="phone" class="input" inputmode="numeric" autocomplete="tel" placeholder="5215512345678" required /></div>
        <div class="hint">Código de país, sin <b>+</b>, espacios ni guiones.</div>
      </div>
    </form>`,
    footer: `<button class="btn btn-ghost" data-action="modal-close">Cancelar</button>
      <button class="btn btn-primary" id="relink-submit" type="submit" form="relink-form">${icon('key')} Generar código</button>`,
  })
}

export async function handleMainRelink(form) {
  const input = form.querySelector('[name="phone"]')
  const submit = document.getElementById('relink-submit')
  const phone = String(input?.value || '').replace(/\D/g, '')
  hideFormError(form)
  if (phone.length < 8 || phone.length > 15) {
    showFormError(form, 'Escribe el número con código de país (entre 8 y 15 dígitos).')
    return
  }
  setLoading(submit, true, 'Preparando…')
  try {
    const data = await api.post('/api/main/relink', { phone })
    state.mainCode = data.code || null
    closeModal()
    showToast('Código generado. Ingrésalo en WhatsApp.', 'success')
    await renderAdmin('principal')
  } catch (error) {
    showFormError(form, error.message || 'No se pudo generar el código.')
    setLoading(submit, false)
  }
}

/* ── Configuración del sub-bot (nombre, imagen, menú…) ───────────────────── */
/** Convierte el formato de WhatsApp (*negrita*, _cursiva_, `código`) a HTML. */
export function formatoWhatsApp(texto) {
  return h(texto)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>')
    .replace(/\n/g, '<br>')
}

export function previewMenuHTML(datos) {
  const preview = datos?.preview || {}
  const imagen = datos?.image
  return `
    <div class="wa-preview">
      <div class="wa-head">
        <div class="wa-avatar">${icon('bot')}</div>
        <div class="wa-head-info">
          <div class="wa-name">${h(preview.nombreBot || 'Bot')}</div>
          <div class="wa-sub">vista previa del menú</div>
        </div>
      </div>
      <div class="wa-body">
        ${imagen
          ? `<div class="wa-image"><img src="${h(imagen)}?v=${Date.now()}" alt="Imagen del menú" /></div>`
          : '<div class="wa-image wa-image-empty"><span>Sin imagen configurada</span></div>'}
        <div class="wa-bubble">${formatoWhatsApp(preview.texto || '')}</div>
      </div>
    </div>
    <div class="wa-cats">
      ${(preview.categorias || []).map((categoria) => `
        <div class="wa-cat">
          <div class="wa-cat-title">${h(categoria.title)}</div>
          <div class="wa-cat-desc">${h(categoria.description || '')}</div>
        </div>`).join('')}
    </div>`
}

export async function openBotConfigModal(phone) {
  let datos
  try {
    datos = await api.get(`/api/bots/${encodeURIComponent(phone)}/config`)
  } catch (error) {
    showToast(error.message || 'No se pudo abrir la configuración.', 'error')
    return
  }
  const config = datos.config || {}
  openModal({
    title: 'Configurar tu sub-bot',
    subtitle: fmtPhone(phone),
    wide: true,
    body: `<div class="bot-config">
      <div class="bot-config-panel">
        <form id="bot-config-form" data-phone="${h(phone)}">
          <div class="form-error">${icon('alert')}<span></span></div>
          <div class="form-success">${icon('check')}<span></span></div>
          <div class="field">
            <label class="label" for="cfg-name">Nombre del bot</label>
            <input id="cfg-name" name="name" class="input" maxlength="40" placeholder="Pain Bot" value="${h(config.name || '')}" />
            <div class="hint">Es el nombre que sale en el menú y en los mensajes del bot. Equivale a <span class="mono">.setbotname</span>.</div>
          </div>
          <div class="field">
            <label class="label">Imagen del menú</label>
            <div class="img-picker">
              <div class="img-preview" id="cfg-image-preview">
                ${datos.image
                  ? `<img src="${h(datos.image)}?v=${Date.now()}" alt="" />`
                  : '<span>Sin imagen</span>'}
              </div>
              <div class="img-picker-actions">
                <label class="btn btn-secondary btn-sm" for="cfg-image">${icon('image')} Elegir imagen</label>
                <input id="cfg-image" type="file" accept="image/png,image/jpeg,image/webp" hidden />
                <div class="hint">JPG, PNG o WEBP (máx. 4 MB). Es la foto que aparece con el menú, como <span class="mono">.setbotimg</span>.</div>
              </div>
            </div>
          </div>
          <div class="field">
            <label class="label" for="cfg-lang">Idioma del bot</label>
            <select id="cfg-lang" name="lang" class="select">
              <option value="es" ${config.lang === 'es' ? 'selected' : ''}>Español</option>
              <option value="en" ${config.lang === 'en' ? 'selected' : ''}>English</option>
              <option value="pt" ${config.lang === 'pt' ? 'selected' : ''}>Português</option>
            </select>
          </div>
          <div class="field">
            <label class="label" for="cfg-menu">Estilo del menú</label>
            <select id="cfg-menu" name="menuModo" class="select">
              <option value="android" ${config.menuModo !== 'ios' ? 'selected' : ''}>Android (carrusel y botones)</option>
              <option value="ios" ${config.menuModo === 'ios' ? 'selected' : ''}>iOS (lista de secciones)</option>
            </select>
          </div>
          <label class="check switch">
            <input type="checkbox" name="autoRead" ${config.autoRead ? 'checked' : ''} />
            <span><b>Marcar mensajes como leídos</b><br /><span class="muted">Auto-leer (doble check azul) como <span class="mono">.setautoread on</span>.</span></span>
          </label>
          <label class="check switch">
            <input type="checkbox" name="antiPv" ${config.antiPv ? 'checked' : ''} />
            <span><b>Privado con desconocidos</b><br /><span class="muted">No responde en privado a quien no es owner (como <span class="mono">.antipv on</span>).</span></span>
          </label>
          <button class="btn btn-primary btn-block" type="submit">${icon('check')} Guardar cambios</button>
        </form>
      </div>
      <div class="bot-config-preview">
        <div class="preview-title">${icon('eye')} Así se verá tu menú en WhatsApp</div>
        <div id="cfg-preview">${previewMenuHTML(datos)}</div>
      </div>
    </div>`,
    footer: `<button class="btn btn-ghost" data-action="modal-close">Cerrar</button>`,
    onMount(root) {
      const input = root.querySelector('#cfg-image')
      input?.addEventListener('change', async () => {
        const archivo = input.files?.[0]
        if (!archivo) return
        if (archivo.size > 4 * 1024 * 1024) {
          showToast('La imagen es muy grande (máximo 4 MB).', 'error')
          input.value = ''
          return
        }
        const lector = new FileReader()
        lector.onload = async () => {
          try {
            const dataUrl = String(lector.result || '')
            const respuesta = await api.post(`/api/bots/${encodeURIComponent(phone)}/config/image`, { dataUrl })
            const marco = root.querySelector('#cfg-image-preview')
            if (marco) marco.innerHTML = `<img src="${respuesta.image}?v=${Date.now()}" alt="" />`
            showToast('Imagen actualizada.', 'success')
          } catch (error) {
            showToast(error.message || 'No se pudo guardar la imagen.', 'error')
          } finally {
            input.value = ''
          }
        }
        lector.readAsDataURL(archivo)
      })
    },
  })
}

export async function handleBotConfigSave(form) {
  const phone = form.dataset.phone
  const submit = form.querySelector('button[type="submit"]')
  hideFormError(form)
  hideFormSuccess(form)
  const cuerpo = {
    name: String(form.querySelector('[name="name"]')?.value || '').trim(),
    lang: String(form.querySelector('[name="lang"]')?.value || 'es'),
    menuModo: String(form.querySelector('[name="menuModo"]')?.value || 'android'),
    autoRead: Boolean(form.querySelector('[name="autoRead"]')?.checked),
    antiPv: Boolean(form.querySelector('[name="antiPv"]')?.checked),
  }
  setLoading(submit, true, 'Guardando…')
  try {
    const datos = await api.patch(`/api/bots/${encodeURIComponent(phone)}/config`, cuerpo)
    const contenedor = document.getElementById('cfg-preview')
    if (contenedor) contenedor.innerHTML = previewMenuHTML(datos)
    showFormSuccess(form, 'Cambios guardados. El bot los aplica al siguiente mensaje.')
    showToast('Configuración guardada.', 'success')
  } catch (error) {
    showFormError(form, error.message || 'No se pudo guardar la configuración.')
  } finally {
    setLoading(submit, false)
  }
}

/* ── Acting as (entrar como usuario) ─────────────────────────────────────── */
export async function impersonarUsuario(id, username) {
  confirmModal({
    title: 'Entrar como usuario',
    message: `Vas a entrar en la cuenta de <b>@${h(username || '')}</b> sin necesidad de su contraseña. Verás el panel tal cual lo ve esa persona y todo lo que cambies afecta a su cuenta. Puedes volver a la tuya con el botón "Volver".`,
    confirmLabel: 'Entrar como usuario',
    danger: false,
    onConfirm: async () => {
      const data = await api.post(`/api/admin/impersonate/${encodeURIComponent(id)}`, {})
      state.user = data.user
      state.csrf = data.csrf
      state.impersonatedBy = data.impersonatedBy || null
      showToast(`Ahora estás dentro de @${data.user.username}.`, 'success')
      window.location.reload()
    },
  })
}

export async function stopImpersonating() {
  try {
    const data = await api.post('/api/auth/stop-impersonating', {})
    state.user = data.user
    state.csrf = data.csrf
    state.impersonatedBy = null
    showToast('Volviste a tu cuenta de administrador.', 'success')
    window.location.reload()
  } catch (error) {
    showToast(error.message || 'No se pudo volver a tu cuenta.', 'error')
  }
}

/* ── Handlers de administración ─────────────────────────────────────────── */
export async function handleUserSave(form) {
  const id = form.dataset.id
  const roleId = form.querySelector('[name="roleId"]')?.value
  const status = form.querySelector('[name="status"]')?.value
  const password = String(form.querySelector('[name="password"]')?.value || '')
  const body = { status }
  if (roleId && !form.querySelector('[name="roleId"]')?.disabled) body.roleId = Number(roleId)
  if (password) body.password = password
  const button = document.getElementById('user-save-btn')

  const aplicar = async () => {
    hideFormError(form)
    setLoading(button, true, 'Guardando…')
    try {
      const data = await api.patch(`/api/admin/users/${encodeURIComponent(id)}`, body)
      if (Number(id) === Number(state.user?.id) && data.user) {
        state.user = { ...state.user, ...data.user }
        if (!data.user.isAdmin) {
          closeModal()
          renderShell()
          navigate('/dashboard')
          showToast('Tu cuenta ya no tiene permisos de administrador.', 'warn')
          return
        }
      }
      closeModal()
      showToast('Usuario actualizado.', 'success')
      await renderAdmin('users')
    } catch (error) {
      showFormError(form, error.message || 'No se pudo actualizar el usuario.')
      setLoading(button, false)
    }
  }

  // Bloquear una cuenta es destructivo (cierra sus sesiones): pedir confirmación.
  if (status === 'banned') {
    confirmModal({
      title: 'Bloquear usuario',
      message: 'La cuenta quedará bloqueada: no podrá iniciar sesión y se cerrarán todas sus sesiones activas. Puedes reactivarla después con el estado «Activo».',
      confirmLabel: 'Bloquear cuenta',
      onConfirm: aplicar,
    })
    return
  }

  await aplicar()
}

export function confirmDeleteUser(id, username) {
  confirmModal({
    title: 'Eliminar usuario',
    message: `Se eliminará la cuenta <b>@${h(username)}</b> del panel. Sus sub-bots seguirán en el servidor, pero quedarán sin dueño. Esta acción no se puede deshacer.`,
    confirmLabel: 'Eliminar usuario',
    onConfirm: async () => {
      await api.del(`/api/admin/users/${encodeURIComponent(id)}`)
      showToast('Usuario eliminado.', 'success')
      await renderAdmin('users')
    },
  })
}

export function confirmAdminDeleteSession(phone) {
  confirmModal({
    title: 'Eliminar sesión',
    message: `Se eliminará la sesión <b>${h(fmtPhone(phone))}</b> del servidor, incluidas sus credenciales y ajustes guardados. Si el número sigue vinculado a WhatsApp, podrá volver a vincularse desde la web.`,
    confirmLabel: 'Eliminar sesión',
    onConfirm: async () => {
      await api.del(`/api/admin/sessions/${encodeURIComponent(phone)}`)
      showToast('Sesión eliminada.', 'success')
      await renderAdmin('sessions')
    },
  })
}

export async function adminReconnect(phone) {
  try {
    const result = await api.post(`/api/admin/sessions/${encodeURIComponent(phone)}/reconnect`, {})
    if (result.ok) {
      showToast('Reconexión solicitada al supervisor.', 'success')
      setTimeout(() => {
        if (state.user && isAdminRoute('sessions')) renderAdmin('sessions')
      }, 1600)
    } else {
      showToast(reconnectReason(result.reason), 'warn')
    }
  } catch (error) {
    showToast(error.message || 'No se pudo reconectar.', 'error')
  }
}

export async function handleSettingsSave(form) {
  const input = form.querySelector('[name="maxSubs"]')
  const inputUsuario = form.querySelector('[name="maxSubsPerUser"]')
  const inputIp = form.querySelector('[name="maxBotsPerIp"]')
  const submit = form.querySelector('button[type="submit"]')
  const maxSubs = Number(input?.value || 0)
  const maxSubsPerUser = Number(inputUsuario?.value || 0)
  const maxBotsPerIp = Number(inputIp?.value || 0)
  hideFormError(form)
  if (!Number.isFinite(maxSubs) || maxSubs < 0) {
    showFormError(form, 'El límite debe ser 0 (ilimitado) o un número mayor.')
    return
  }
  if (!Number.isFinite(maxSubsPerUser) || maxSubsPerUser < 0) {
    showFormError(form, 'El límite por cuenta debe ser 0 (ilimitado) o un número mayor.')
    return
  }
  if (!Number.isFinite(maxBotsPerIp) || maxBotsPerIp < 0) {
    showFormError(form, 'El límite por IP debe ser 0 (ilimitado) o un número mayor.')
    return
  }
  setLoading(submit, true, 'Guardando…')
  try {
    const data = await api.patch('/api/admin/settings', { maxSubs, maxSubsPerUser, maxBotsPerIp })
    state.config = { ...(state.config || {}), maxSubs: data.maxSubs }
    showToast('Límites actualizados.', 'success')
    await renderAdmin('settings')
  } catch (error) {
    showFormError(form, error.message || 'No se pudo guardar el límite.')
    setLoading(submit, false)
  }
}

export async function handleSettingsTurnstileSave(form) {
  const siteKey = form.querySelector('[name="siteKey"]')?.value.trim() || ''
  const secretKey = form.querySelector('[name="secretKey"]')?.value.trim() || ''
  const submit = form.querySelector('button[type="submit"]')

  hideFormError(form)
  setLoading(submit, true, 'Guardando…')
  try {
    const payload = { turnstileSiteKey: siteKey }
    if (secretKey) payload.turnstileSecretKey = secretKey
    const data = await api.patch('/api/admin/settings', payload)
    state.config = { ...(state.config || {}), turnstileSiteKey: data.turnstileSiteKey || '' }
    showToast(
      data.turnstileEnabled ? 'Turnstile activado.' : 'Turnstile desactivado o incompleto.',
      data.turnstileEnabled ? 'success' : 'warn'
    )
    await renderAdmin('settings')
  } catch (error) {
    showFormError(form, error.message || 'No se pudo guardar Turnstile.')
    setLoading(submit, false)
  }
}

/* ── Ajustes del sub-bot premium (anuncios) ─────────────────────────────── */
export async function handleSettingsPremiumSave(form) {
  const submit = form.querySelector('button[type="submit"]')
  const numero = (nombre, porDefecto) => {
    const valor = Number(form.querySelector(`[name="${nombre}"]`)?.value)
    return Number.isFinite(valor) ? valor : porDefecto
  }
  const texto = (nombre) => String(form.querySelector(`[name="${nombre}"]`)?.value || '').trim()
  const premium = {
    enabled: Boolean(form.querySelector('[name="enabled"]')?.checked),
    adMinutes: numero('adMinutes', 60),
    adSeconds: numero('adSeconds', 5),
    cooldownSeconds: numero('cooldownSeconds', 5),
    maxHours: numero('maxHours', 24),
    unlockHours: numero('unlockHours', 10),
    smartlink: texto('smartlink'),
    placements: Object.fromEntries(['dashboard', 'bots', 'premium', 'communities', 'link', 'account'].map((pagina) => [pagina,
      Object.fromEntries(['header', 'footer'].map((zona) => [zona, Boolean(form.querySelector(`[name="ad-${pagina}-${zona}"]`)?.checked)])),
    ])),
    banners: {
      small: texto('bannerSmall'),
      medium: texto('bannerMedium'),
      native: texto('bannerNative'),
      square: texto('bannerSquare'),
      tall: texto('bannerTall'),
      leaderboard: texto('bannerLeaderboard'),
      wide: texto('bannerWide'),
    },
  }
  hideFormError(form)
  if (premium.maxHours < 1) {
    showFormError(form, 'El tope del banco debe ser de al menos 1 hora.')
    return
  }
  if (premium.unlockHours >= premium.maxHours) {
    showFormError(form, 'El desbloqueo debe ser menor que el tope (si no, el botón nunca se reabriría).')
    return
  }
  setLoading(submit, true, 'Guardando…')
  try {
    const data = await api.patch('/api/admin/settings', { premium })
    const guardado = data.premium || premium
    if (state.config) {
      state.config.adsPlacements = guardado.placements
      state.config.adsBanners = guardado.banners
    }
    showToast(
      guardado.enabled === false
        ? 'Premium desactivado.'
        : `Premium actualizado: ${guardado.adMinutes} min por anuncio, tope ${guardado.maxHours} h.`,
      guardado.enabled === false ? 'warn' : 'success'
    )
    await renderAdmin('settings')
  } catch (error) {
    showFormError(form, error.message || 'No se pudo guardar la configuración de anuncios.')
    setLoading(submit, false)
  }
}

/* ── Roles y permisos ───────────────────────────────────────────────────── */
export async function handleRoleSave(form) {
  const id = form.dataset.id
  const name = String(form.querySelector('[name="name"]')?.value || '').trim()
  const description = String(form.querySelector('[name="description"]')?.value || '').trim()
  const scope = form.querySelector('[name="scope"]')?.value === 'user' ? 'user' : 'admin'
  const permissions = [...form.querySelectorAll('[data-role-permission]:checked')]
    .map((input) => input.dataset.rolePermission)
  const button = document.getElementById('role-save-btn')

  hideFormError(form)
  if (name.length < 2) {
    showFormError(form, 'Escribe un nombre de al menos 2 caracteres.')
    return
  }
  setLoading(button, true, 'Guardando…')
  try {
    const body = { name, description, permissions }
    if (!id) body.scope = scope
    const data = id
      ? await api.patch(`/api/admin/roles/${encodeURIComponent(id)}`, body)
      : await api.post('/api/admin/roles', body)
    closeModal()
    showToast(id ? 'Rol actualizado.' : 'Rol creado.', 'success')
    if (Number(state.user?.roleId) === Number(data.role?.id)) {
      // Si el principal editó su propio rol (no debería), refresca la sesión.
      state.user.permissions = data.role.permissions
    }
    await renderAdmin('roles')
  } catch (error) {
    showFormError(form, error.message || 'No se pudo guardar el rol.')
    setLoading(button, false)
  }
}

export function confirmDeleteRole(id, name) {
  confirmModal({
    title: 'Eliminar rol',
    message: `Se eliminará el rol <b>${h(name)}</b>. Solo se puede borrar si no tiene usuarios asignados. Esta acción no se puede deshacer.`,
    confirmLabel: 'Eliminar rol',
    onConfirm: async () => {
      await api.del(`/api/admin/roles/${encodeURIComponent(id)}`)
      showToast('Rol eliminado.', 'success')
      await renderAdmin('roles')
    },
  })
}

/* ── Correo / SMTP / plantillas ─────────────────────────────────────────── */
export async function handleMailSettingsSave(form) {
  const submit = form.querySelector('button[type="submit"]')
  const password = String(form.querySelector('[name="password"]')?.value || '')
  const body = {
    host: String(form.querySelector('[name="host"]')?.value || '').trim(),
    port: Number(form.querySelector('[name="port"]')?.value || 465),
    encryption: form.querySelector('[name="encryption"]')?.value || 'ssl',
    mailer: form.querySelector('[name="mailer"]')?.value || 'smtp',
    user: String(form.querySelector('[name="user"]')?.value || '').trim(),
    from: String(form.querySelector('[name="from"]')?.value || '').trim(),
    fromName: String(form.querySelector('[name="fromName"]')?.value || '').trim(),
    requireEmailVerification: Boolean(form.querySelector('[name="requireEmailVerification"]')?.checked),
  }
  if (password) body.password = password

  hideFormError(form)
  setLoading(submit, true, 'Guardando…')
  try {
    const data = await api.patch('/api/admin/mail', body)
    state.adminMail = { ...(state.adminMail || {}), config: data.config, requireEmailVerification: data.requireEmailVerification }
    state.config = { ...(state.config || {}), mailConfigured: data.config?.configured, requireEmailVerification: data.requireEmailVerification }
    showFormSuccess(form, 'Configuración de correo guardada.')
    showToast(data.config?.configured ? 'Correo configurado.' : 'Guardado. Faltan datos para poder enviar correos.', data.config?.configured ? 'success' : 'warn')
    await renderAdmin('mail')
  } catch (error) {
    showFormError(form, error.message || 'No se pudo guardar el correo.')
    setLoading(submit, false)
  }
}

export async function handleMailTest(form) {
  const to = String(form.querySelector('[name="to"]')?.value || '').trim()
  const submit = form.querySelector('button[type="submit"]')
  hideFormError(form)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    showFormError(form, 'Escribe un correo de destino válido.')
    return
  }
  setLoading(submit, true, 'Enviando…')
  try {
    const data = await api.post('/api/admin/mail/test', { to })
    showFormSuccess(form, `Correo de prueba enviado a ${to}.`)
    showToast(`Prueba enviada a ${data.to || to}.`, 'success')
  } catch (error) {
    showFormError(form, error.message || 'No se pudo enviar la prueba.')
  } finally {
    setLoading(submit, false)
  }
}

export async function handleMailTemplatesSave(form) {
  const submit = form.querySelector('button[type="submit"]')
  const templates = {}
  for (const bloque of form.querySelectorAll('[data-template-key]')) {
    const key = bloque.dataset.templateKey
    templates[key] = {
      subject: String(bloque.querySelector(`[name="subject-${key}"]`)?.value || ''),
      html: String(bloque.querySelector(`[name="html-${key}"]`)?.value || ''),
      text: String(bloque.querySelector(`[name="text-${key}"]`)?.value || ''),
    }
  }
  hideFormError(form)
  setLoading(submit, true, 'Guardando…')
  try {
    const data = await api.patch('/api/admin/mail/templates', { templates })
    state.adminMail = { ...(state.adminMail || {}), templates: data.templates }
    showFormSuccess(form, 'Mensajes guardados.')
    showToast('Mensajes de correo guardados.', 'success')
  } catch (error) {
    showFormError(form, error.message || 'No se pudieron guardar los mensajes.')
  } finally {
    setLoading(submit, false)
  }
}

export function openMailTest() {
  const form = document.getElementById('mail-test-form')
  if (!form) return
  form.style.display = form.style.display === 'none' ? '' : 'none'
  if (form.style.display !== 'none') form.querySelector('input')?.focus()
}

export async function handleSettingsLimitsSave(form) {
  const numero = (selector) => {
    const valor = Number(form.querySelector(selector)?.value || 0)
    return Number.isFinite(valor) && valor >= 0 ? valor : NaN
  }
  const porHora = numero('[name="maxPairAttemptsPerHour"]')
  const porDia = numero('[name="maxPairAttemptsPerDay"]')
  const porIp = numero('[name="maxPairAttemptsPerIpPerHour"]')
  const espera = numero('[name="pairCooldownSeconds"]')
  const duracion = numero('[name="pairCodeSeconds"]')
  const submit = form.querySelector('button[type="submit"]')
  hideFormError(form)
  if ([porHora, porDia, porIp, espera, duracion].some((valor) => Number.isNaN(valor))) {
    showFormError(form, 'Todos los valores deben ser 0 o un número mayor.')
    return
  }
  if (duracion < 15) {
    showFormError(form, 'La duración del código debe ser de 15 segundos o más.')
    return
  }
  setLoading(submit, true, 'Guardando…')
  try {
    await api.patch('/api/admin/settings', {
      maxPairAttemptsPerHour: porHora,
      maxPairAttemptsPerDay: porDia,
      maxPairAttemptsPerIpPerHour: porIp,
      pairCooldownSeconds: espera,
      pairCodeSeconds: duracion,
    })
    showToast('Límites de intentos actualizados.', 'success')
    await renderAdmin('settings')
  } catch (error) {
    showFormError(form, error.message || 'No se pudieron guardar los límites.')
    setLoading(submit, false)
  }
}
