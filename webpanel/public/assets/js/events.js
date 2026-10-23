/* Pain Panel — módulo events */
import { handleAuth, handleLogout, openAuthModal, renderAuth } from './auth.js'
import { closeModal, copyText, icon, isAdminRoute, modalRoot, showToast, state } from './core.js'
import {
  adminReconnect,
  confirmAdminDeleteSession,
  confirmDeleteUser,
  handleBotConfigSave,
  handleMainLink,
  handleMainRelink,
  handleMainRestart,
  handleMainUnlink,
  handleSettingsLimitsSave,
  handleSettingsSave,
  handleSettingsTurnstileSave,
  handleUserSave,
  impersonarUsuario,
  openBotConfigModal,
  openRelinkModal,
  stopImpersonating,
} from './handlers-admin.js'
import {
  aplicarCambiosEnCaliente,
  confirmarReinicioDelProceso,
  confirmDeleteBot,
  confirmDeleteCommunity,
  handleAdminReload,
  handleAdminUpdate,
  handleBotRelink,
  handleCommunityEdit,
  handleCommunitySave,
  handleEmailSave,
  handleLinkCancel,
  handleLinkRegenerate,
  handlePasswordChange,
  handleRename,
  handleStartLink,
  openCommunityModal,
  reconnectBot,
  resetLinkFlow,
  toggleCommunity,
} from './handlers-user.js'
import {
  actualizarSeleccion,
  alternarSeleccionSesion,
  aplicarFiltroSesiones,
  eliminarSesionesSeleccionadas,
  filasSesionVisibles,
  openRenameModal,
  openUserModal,
  renderAdmin,
} from './pages-admin.js'
import { route, toggleSidebar } from './shell.js'

/* ── Delegación de eventos ──────────────────────────────────────────────── */
export async function onClick(event) {
  const actionEl = event.target.closest('[data-action]')
  if (actionEl) {
    const action = actionEl.dataset.action
    const phone = actionEl.dataset.phone
    const id = actionEl.dataset.id

    if (action === 'toggle-sidebar') {
      toggleSidebar()
      return
    }
    if (action === 'close-sidebar') {
      document.getElementById('app-shell')?.classList.remove('sidebar-open')
      return
    }
    if (action === 'modal-close') {
      closeModal()
      return
    }
    if (action === 'close-toast') {
      actionEl.closest('.toast')?.remove()
      return
    }
    if (action === 'copy') {
      copyText(actionEl.dataset.copy || '')
      return
    }
    if (action === 'refresh') {
      await route()
      return
    }
    if (action === 'logout') {
      await handleLogout()
      return
    }
    if (action === 'auth-tab') {
      state.authTab = actionEl.dataset.tab === 'register' ? 'register' : 'login'
      // Si las pestañas están dentro del modal, hay que repintar el modal,
      // no la landing (renderAuth cerraría el modal).
      if (modalRoot && modalRoot.classList.contains('open')) openAuthModal()
      else renderAuth()
      return
    }
    if (action === 'auth-open-login') {
      state.authTab = 'login'
      openAuthModal()
      return
    }
    if (action === 'auth-open-register') {
      state.authTab = 'register'
      openAuthModal()
      return
    }
    if (action === 'toggle-password') {
      const input = document.getElementById(actionEl.dataset.input || '')
      if (!input) return
      const show = input.type === 'password'
      input.type = show ? 'text' : 'password'
      actionEl.innerHTML = icon(show ? 'eyeOff' : 'eye')
      return
    }
    if (action === 'bot-delete') {
      confirmDeleteBot(phone, actionEl.dataset.label || '')
      return
    }
    if (action === 'bot-config') {
      await openBotConfigModal(phone)
      return
    }
    if (action === 'bot-reconnect') {
      await reconnectBot(phone)
      return
    }
    if (action === 'bot-relink') {
      handleBotRelink(phone)
      return
    }
    if (action === 'bot-rename') {
      openRenameModal(phone, actionEl.dataset.label || '')
      return
    }
    if (action === 'link-new') {
      resetLinkFlow()
      return
    }
    if (action === 'link-cancel') {
      await handleLinkCancel()
      return
    }
    if (action === 'link-regenerate') {
      await handleLinkRegenerate()
      return
    }
    if (action === 'admin-impersonate') {
      impersonarUsuario(id, actionEl.dataset.username || '')
      return
    }
    if (action === 'apply-updates') {
      await aplicarCambiosEnCaliente()
      return
    }
    if (action === 'restart-bot') {
      await confirmarReinicioDelProceso()
      return
    }
    if (action === 'stop-impersonating') {
      await stopImpersonating()
      return
    }
    if (action === 'admin-user-edit') {
      openUserModal(id)
      return
    }
    if (action === 'admin-user-delete') {
      confirmDeleteUser(id, actionEl.dataset.username || 'usuario')
      return
    }
    if (action === 'admin-session-reconnect') {
      await adminReconnect(phone)
      return
    }
    if (action === 'admin-session-delete') {
      confirmAdminDeleteSession(phone)
      return
    }
    if (action === 'main-unlink') {
      await handleMainUnlink()
      return
    }
    if (action === 'main-relink') {
      openRelinkModal()
      return
    }
    if (action === 'main-restart') {
      await handleMainRestart()
      return
    }
    if (action === 'main-clear-code') {
      state.mainCode = null
      if (isAdminRoute('principal')) renderAdmin('principal')
      return
    }
    if (action === 'admin-update') {
      await handleAdminUpdate()
      return
    }
    if (action === 'admin-reload') {
      await handleAdminReload()
      return
    }
    if (action === 'community-toggle') {
      await toggleCommunity(id, actionEl.dataset.active === '1')
      return
    }
    if (action === 'community-edit') {
      const comunidad = (state.adminCommunities || []).find((item) => String(item.id) === String(id))
      if (!comunidad) {
        showToast('No se encontró la comunidad. Actualiza la lista.', 'error')
        return
      }
      openCommunityModal(comunidad)
      return
    }
    if (action === 'community-delete') {
      confirmDeleteCommunity(id, actionEl.dataset.name || 'comunidad')
      return
    }
    if (action === 'session-filter') {
      aplicarFiltroSesiones(actionEl.dataset.filter || 'all')
      return
    }
    if (action === 'session-select-all') {
      const marcar = state.selectedSessions.size < filasSesionVisibles().length
      filasSesionVisibles().forEach((fila) => {
        const phone = fila.dataset.sessionPhone
        if (!phone) return
        if (marcar) state.selectedSessions.add(phone)
        else state.selectedSessions.delete(phone)
        const box = fila.querySelector('[data-session-check]')
        if (box) box.checked = marcar
      })
      actualizarSeleccion()
      return
    }
    if (action === 'session-clear') {
      state.selectedSessions.clear()
      document.querySelectorAll('[data-session-check]').forEach((box) => { box.checked = false })
      actualizarSeleccion()
      return
    }
    if (action === 'session-delete-selected') {
      await eliminarSesionesSeleccionadas()
      return
    }
  }

  const nav = event.target.closest('.nav-link')
  if (nav && window.innerWidth <= 900) {
    document.getElementById('app-shell')?.classList.remove('sidebar-open')
  }
}

export async function onSubmit(event) {
  const form = event.target
  if (!(form instanceof HTMLFormElement)) return
  const id = form.id

  if (id === 'auth-form') {
    event.preventDefault()
    await handleAuth(form)
    return
  }
  if (id === 'link-form') {
    event.preventDefault()
    await handleStartLink(form)
    return
  }
  if (id === 'password-form') {
    event.preventDefault()
    await handlePasswordChange(form)
    return
  }
  if (id === 'email-form') {
    event.preventDefault()
    await handleEmailSave(form)
    return
  }
  if (id === 'rename-form') {
    event.preventDefault()
    await handleRename(form)
    return
  }
  if (id === 'user-form') {
    event.preventDefault()
    await handleUserSave(form)
    return
  }
  if (id === 'settings-form') {
    event.preventDefault()
    await handleSettingsSave(form)
    return
  }
  if (id === 'settings-limits-form') {
    event.preventDefault()
    await handleSettingsLimitsSave(form)
    return
  }
  if (id === 'settings-turnstile-form') {
    event.preventDefault()
    await handleSettingsTurnstileSave(form)
    return
  }
  if (id === 'bot-config-form') {
    event.preventDefault()
    await handleBotConfigSave(form)
    return
  }
  if (id === 'main-link-form') {
    event.preventDefault()
    await handleMainLink(form)
    return
  }
  if (id === 'community-form') {
    event.preventDefault()
    await handleCommunitySave(form)
    return
  }
  if (id === 'community-edit-form') {
    event.preventDefault()
    await handleCommunityEdit(form)
    return
  }
  if (id === 'relink-form') {
    event.preventDefault()
    await handleMainRelink(form)
  }
}

export function onKeydown(event) {
  if (event.key === 'Escape') {
    closeModal()
    document.getElementById('app-shell')?.classList.remove('sidebar-open')
  }
}

/** Casillas de selección de sesiones (admin). */
export function onChange(event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return

  if (target.matches('[data-session-check-all]')) {
    filasSesionVisibles().forEach((fila) => {
      const phone = fila.dataset.sessionPhone
      if (!phone) return
      if (target.checked) state.selectedSessions.add(phone)
      else state.selectedSessions.delete(phone)
      const box = fila.querySelector('[data-session-check]')
      if (box) box.checked = target.checked
    })
    actualizarSeleccion()
    return
  }

  if (target.matches('[data-session-check]')) {
    alternarSeleccionSesion(target.dataset.sessionCheck, target.checked)
  }
}
