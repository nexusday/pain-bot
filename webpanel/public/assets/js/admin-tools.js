import { api } from './api.js'
import {
  h,
  icon,
  fmtDate,
  content,
  hideFormError,
  showFormError,
  showToast,
  setLoading,
  state,
  puede,
} from './core.js'
import { renderAdmin } from './pages-admin.js'

export function notificationsHTML(data) {
  state.adminPushUsers = data.users || []
  if (state.pushSelectionOwner !== state.user.id) {
    state.adminPushSelection = new Set()
    state.pushSelectionOwner = state.user.id
  }
  const selected = state.adminPushSelection
  return `<div class="grid-2"><div class="stack"><div class="card"><div class="card-head"><div><h3>Enviar una notificación</h3><p>Avisos breves, sin necesidad de tener abierto el panel</p></div></div><div class="card-body"><form id="push-send-form"><div class="form-error">${icon('alert')}<span></span></div><div class="field"><label class="label">Título</label><input name="title" class="input" maxlength="100" required placeholder="Novedades de PAIN BOT MD" /></div><div class="field"><label class="label">Mensaje</label><textarea name="body" class="input" maxlength="1000" rows="4" required placeholder="Escribe el aviso que recibirán los usuarios"></textarea></div><div class="field"><label class="label">Al pulsar la notificación</label><input name="url" class="input" value="/#/dashboard" maxlength="500" /><div class="hint">Solo rutas del propio panel, por ejemplo /#/account.</div></div><div class="field"><label class="label">Destinatarios</label><select name="audience" class="select"><option value="selected">Los usuarios que seleccione</option><option value="all">Todos los usuarios con notificaciones activas</option></select></div><button class="btn btn-primary" type="submit">${icon('mail')} Programar envío</button><div class="hint">Se envían en segundo plano y por lotes. «Aceptadas» no significa que el usuario las haya leído.</div></form></div></div>${data.canSettings ? `<div class="card"><div class="card-head"><div><h3>Aviso para activar notificaciones</h3><p>Cuándo volver a mostrar la tarjeta flotante</p></div></div><div class="card-body"><form id="push-settings-form"><div class="form-error">${icon('alert')}<span></span></div><label class="toggle"><input name="enabled" type="checkbox" ${data.settings.enabled ? 'checked' : ''}/> Mostrar aviso a usuarios sin notificaciones</label><div class="field" style="margin-top:14px"><label class="label">Recordar cada</label><div class="input-group"><input name="interval" type="number" min="1" class="input" value="${data.settings.promptMinutes % 60 === 0 ? data.settings.promptMinutes / 60 : data.settings.promptMinutes}"/><select name="unit" class="input"><option value="1" ${data.settings.promptMinutes % 60 ? 'selected' : ''}>minutos</option><option value="60" ${data.settings.promptMinutes % 60 === 0 ? 'selected' : ''}>horas</option></select></div><div class="hint">Entre 5 minutos y 30 días. «Ahora no» aplaza el aviso en ese dispositivo.</div></div><button class="btn btn-primary">Guardar intervalo</button></form></div></div>` : ''}</div><div class="stack"><div class="card"><div class="card-head"><div><h3>Destinatarios</h3><p>Estado conocido por dispositivo; no se muestran IP</p></div></div><div class="card-body"><form id="push-users-search" class="input-group"><input name="q" class="input" placeholder="Buscar usuario o correo"/><button class="btn btn-secondary">Buscar</button></form><div class="push-user-list" style="margin-top:14px">${data.users.map((user) => `<label class="push-user"><input type="checkbox" data-push-user="${user.id}" ${selected.has(Number(user.id)) ? 'checked' : ''}/><span class="grow"><b>${h(user.username)}</b><small class="hint" style="display:block">${h(user.email || 'Sin correo')} · ${user.activeDevices} dispositivo(s) activos</small><small class="hint">Última comprobación: ${user.checkedAt ? fmtDate(user.checkedAt) : 'Sin datos'}</small></span><span class="badge ${user.pushStatus === 'active' ? 'success' : 'neutral'}">${user.pushStatus === 'active' ? 'Activadas' : user.pushStatus === 'denied' ? 'Bloqueadas' : 'Sin activar'}</span></label>`).join('') || '<p class="hint">No hay usuarios con esa búsqueda.</p>'}</div><div class="flex gap-8" style="margin-top:14px"><button class="btn btn-ghost btn-sm" data-action="push-users-prev">Anterior</button><button class="btn btn-ghost btn-sm" data-action="push-users-next">Siguiente</button></div><div class="hint">El navegador comunica los cambios al visitar el panel, al recuperar el foco o al cambiar el permiso mientras está abierto. Los servicios push también avisan de suscripciones caducadas. No es posible detectar inmediatamente una revocación con el navegador cerrado.</div></div></div><div class="card"><div class="card-head"><div><h3>Últimos envíos</h3><p>Historial de campañas</p></div><button class="btn btn-ghost btn-sm" data-action="push-history-refresh">Actualizar</button></div><div class="card-body">${data.history.map((job) => `<div class="push-user"><div><b>${h(job.title)}</b><p class="hint">${h(job.body)}</p><span class="tiny muted">${fmtDate(job.created_at)} · ${h(job.status)} · ${job.sent || 0}/${job.total} aceptadas · ${job.failed || 0} fallidas · ${job.skipped || 0} omitidas</span></div></div>`).join('') || '<p class="hint">Todavía no hay envíos.</p>'}</div></div></div></div>`
}

export async function handlePushSend(form) {
  hideFormError(form)
  const button = form.querySelector('[type="submit"]')
  setLoading(button, true, 'Preparando…')
  try {
    const data = Object.fromEntries(new FormData(form))
    data.userIds = [...(state.adminPushSelection || [])]
    const result = await api.post('/api/admin/notifications', data)
    showToast(
      `Envío en cola para ${result.users} usuario(s), ${result.devices} dispositivo(s).`,
      'success'
    )
    await renderAdmin('notifications')
  } catch (error) {
    showFormError(form, error.message)
  } finally {
    setLoading(button, false)
  }
}
export async function handlePushSettings(form) {
  hideFormError(form)
  try {
    await api.patch('/api/admin/notifications', {
      enabled: form.elements.enabled.checked,
      promptMinutes:
        Number(form.elements.interval.value) * Number(form.elements.unit.value),
    })
    showToast('Intervalo guardado.', 'success')
  } catch (error) {
    showFormError(form, error.message)
  }
}

export function backupsHTML() {
  return backupsBaseHTML().replace(
    /<form id="backup-(?:export|import)-form">/g,
    (match) =>
      `${match}<div class="field"><label class="label">Tu contraseña actual del panel</label><input name="currentPassword" type="password" class="input" maxlength="200" autocomplete="current-password" required/><div class="hint">Confirmación de seguridad del administrador principal.</div></div>`
  )
}
function backupsBaseHTML() {
  return `<div class="grid-2"><div class="card"><div class="card-head"><div><h3>Descargar una copia</h3><p>Solo el administrador principal</p></div></div><div class="card-body"><form id="backup-export-form"><div class="form-error">${icon('alert')}<span></span></div><div class="field"><label class="label">Qué guardar</label><select class="input" name="scope"><option value="all">Usuarios del panel y base global de WhatsApp</option><option value="panel">Solo usuarios, roles y ajustes del panel</option><option value="global">Solo la base global de WhatsApp</option></select></div><div class="field"><label class="label">Contraseña de la copia</label><input class="input" name="password" type="password" minlength="12" maxlength="200" autocomplete="new-password" required/><div class="hint">Mínimo 12 caracteres. La necesitas para importar. Guarda la copia y su contraseña fuera del servidor.</div></div><button class="btn btn-primary" type="submit">${icon('download')} Descargar copia cifrada</button></form><div class="notice" style="margin-top:18px">Se conservan los hashes de contraseña: los usuarios podrán iniciar sesión con sus claves habituales. La base global incluye los datos confirmados de monedas, perfiles, matrimonios y demás colecciones. No incluye sesiones ni credenciales de WhatsApp, cookies web o códigos temporales.</div></div></div><div class="card"><div class="card-head"><div><h3>Preparar una importación</h3><p>Validación antes de tocar las bases actuales</p></div></div><div class="card-body"><form id="backup-import-form"><div class="form-error">${icon('alert')}<span></span></div><div class="field"><label class="label">Archivo .painbackup</label><input name="file" type="file" class="input" accept=".painbackup,application/json" required/></div><div class="field"><label class="label">Contraseña de la copia</label><input name="password" type="password" class="input" minlength="12" maxlength="200" autocomplete="off" required/></div><label class="toggle"><input type="checkbox" name="confirm" required/> Entiendo que restaurar reemplaza los datos actuales, no los mezcla.</label><button class="btn btn-primary" type="submit" style="margin-top:16px">Validar y preparar importación</button></form><div id="backup-import-result" style="margin-top:16px"></div><p class="hint">Por seguridad, la restauración se aplica con el bot y sus workers detenidos mediante el comando que aparece al validar. Así ningún proceso puede volver a escribir datos antiguos. Antes de reemplazar nada se guarda una copia local de recuperación.</p><p class="hint">En el servidor nuevo configura PAIN_WEB_ADMIN_USER con el nombre del principal restaurado y PAIN_WEB_ADMIN_RESET=0. Si cambias de dominio, los usuarios deberán activar de nuevo las notificaciones en ese dominio.</p></div></div></div>`
}
export async function handleBackupExport(form) {
  hideFormError(form)
  const button = form.querySelector('[type="submit"]')
  setLoading(button, true, 'Preparando copia…')
  try {
    const response = await fetch('/api/admin/backups/export', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': state.csrf,
      },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    })
    if (!response.ok) {
      const text = await response.text()
      let error = null
      try { error = JSON.parse(text) } catch {}
      throw new Error(error?.error || 'No se pudo exportar.')
    }
    const blob = await response.blob(),
      url = URL.createObjectURL(blob),
      link = document.createElement('a')
    link.href = url
    link.download = `pain-backup-${new Date().toISOString().slice(0, 10)}.painbackup`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    form.elements.password.value = ''
    showToast('Copia descargada. Guárdala en un lugar seguro.', 'success')
  } catch (error) {
    showFormError(form, error.message)
  } finally {
    setLoading(button, false)
  }
}
export async function handleBackupImport(form) {
  hideFormError(form)
  const button = form.querySelector('[type="submit"]')
  setLoading(button, true, 'Validando…')
  try {
    const file = form.elements.file.files[0]
    if (!file || file.size > 48 * 1024 * 1024)
      throw new Error('Selecciona una copia de hasta 48 MB.')
    const archive = JSON.parse(await file.text())
    const result = await api.post('/api/admin/backups/import', {
      archive,
      password: form.elements.password.value,
      currentPassword: form.elements.currentPassword.value,
      confirm: form.elements.confirm.checked,
    })
    document.getElementById('backup-import-result').innerHTML =
      `<div class="notice"><div><b>Copia validada</b><p>${result.users} usuarios del panel. Base global: ${result.global ? 'incluida' : 'no incluida'}.</p><p>Detén el bot y ejecuta desde su carpeta:</p><code>${h(result.command)}</code><p>Después inicia el bot de nuevo. Conserva la copia descargada.</p></div></div>`
    form.elements.password.value = ''
  } catch (error) {
    showFormError(form, error.message)
  } finally {
    setLoading(button, false)
  }
}
