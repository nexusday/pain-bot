import { api } from './api.js'
import { h, icon, showToast, state } from './core.js'

let timer, currentUser, permissionStatus
let lastSync = 0,
  lastPermission = '',
  syncing = false
const supported = () =>
  typeof window !== 'undefined' &&
  window.isSecureContext &&
  'Notification' in window &&
  'serviceWorker' in navigator &&
  'PushManager' in window
const permission = () => (supported() ? Notification.permission : 'unsupported')
function device() {
  let id = localStorage.getItem('pain.push.device')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('pain.push.device', id)
  }
  return id
}
const hide = () => document.getElementById('push-prompt')?.remove()
const keyBytes = (key) =>
  Uint8Array.from(
    atob(
      key.replace(/-/g, '+').replace(/_/g, '/') +
        '='.repeat((4 - (key.length % 4)) % 4)
    ),
    (c) => c.charCodeAt(0)
  )
const config = () =>
  api.get(`/api/account/push?deviceId=${encodeURIComponent(device())}`)
const register = async () => {
  await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  return navigator.serviceWorker.ready
}
const save = (subscription) =>
  api.post('/api/account/push', {
    deviceId: device(),
    permission: permission(),
    subscription: permission() === 'granted' ? subscription?.toJSON() : null,
  })
async function currentSubscription(reg,cfg,activate=false){
  let sub=await reg.pushManager.getSubscription()
  const key=keyBytes(cfg.publicKey),oldKey=sub?.options?.applicationServerKey
  const previous=oldKey?new Uint8Array(oldKey):null
  const changed=previous&&(previous.length!==key.length||previous.some((value,index)=>value!==key[index]))
  const repair=cfg.reason==='expired'||changed
  if(sub&&repair){await sub.unsubscribe();sub=null}
  if(permission()==='granted'&&!sub&&(activate||cfg.enabled||repair))sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key})
  return sub
}
export function pushAccountHTML() {
  const p = permission(),
    active = Boolean(state.pushDevice?.enabled && p === 'granted')
  const label = active
    ? 'Activadas'
    : p === 'denied'
      ? 'Bloqueadas'
      : p === 'unsupported'
        ? 'No disponibles'
        : 'Desactivadas'
  return `<div class="card"><div class="card-head"><div><h3>Notificaciones</h3><p>Novedades del panel y del bot</p></div><span class="badge ${active ? 'success' : 'neutral'}">${h(label)}</span></div><div class="card-body"><p class="hint">El permiso es independiente en cada navegador. Al volver al panel comprobamos si sigue activo y actualizamos tu estado.</p>${p === 'denied' ? '<p class="hint">Activa las notificaciones de este sitio en los ajustes de tu navegador y pulsa «Comprobar estado».</p>' : ''}${p === 'unsupported' ? '<p class="hint">Necesitas HTTPS y un navegador compatible. En iPhone o iPad puede ser necesario añadir el panel a la pantalla de inicio.</p>' : ''}<div class="flex gap-8" style="flex-wrap:wrap"><button class="btn btn-primary" data-action="push-enable" ${!supported() ? 'disabled' : ''}>${icon('mail')} ${active ? 'Comprobar estado' : 'Activar notificaciones'}</button>${active ? '<button class="btn btn-secondary" data-action="push-disable">Desactivar en este dispositivo</button>' : ''}<button class="btn btn-ghost" data-action="push-check">Comprobar estado</button></div></div></div>`
}
function repaint() {
  const box = document.getElementById('account-push')
  if (box) box.innerHTML = pushAccountHTML()
  const data = state.pushDevice
  if (
    !state.user ||
    !supported() ||
    !data?.settings?.enabled ||
    data.enabled ||
    Date.now() < data.promptAfter
  ) {
    hide()
    return
  }
  if (document.getElementById('push-prompt')) return
  const node = document.createElement('aside')
  node.id = 'push-prompt'
  node.className = 'push-prompt'
  node.setAttribute('aria-label', 'Avisos del panel')
  node.innerHTML = `<div class="push-prompt-icon">${icon('mail')}</div><div class="grow"><b>¿Te avisamos de las novedades?</b><p>Recibe avisos del panel y del bot en este dispositivo. Puedes desactivarlos cuando quieras.</p>${data.permission === 'denied' ? '<p class="text-warn">Tu navegador los tiene bloqueados. Cámbialo en los ajustes de este sitio para activarlos.</p>' : ''}<div class="flex gap-8"><button class="btn btn-primary btn-sm" data-action="push-enable">Activar avisos</button><button class="btn btn-ghost btn-sm" data-action="push-dismiss">Ahora no</button></div></div>`
  document.body.appendChild(node)
}
export async function syncPush(force = false) {
  if (!state.user || syncing) return
  if (
    !force &&
    permission() === lastPermission &&
    Date.now() - lastSync < 600000
  ) {
    repaint()
    return
  }
  syncing = true
  const uid = state.user.id
  try {
    const cfg = await config()
    let sub = null
    if (supported()) {
      const reg = await register()
      try{sub=await currentSubscription(reg,cfg)}catch{}
    }
    if (state.user?.id !== uid) return
    state.pushDevice = { ...cfg, ...(await save(sub)) }
    lastSync = Date.now()
    lastPermission = permission()
    repaint()
  } catch {
  } finally {
    syncing = false
  }
}
export async function enablePush() {
  if (!supported()) {
    showToast('Este navegador no admite notificaciones push.', 'warn')
    return
  }
  // Iniciar el permiso nativo dentro del clic, sin esperar a la red.
  const requested =
    permission() === 'default'
      ? Notification.requestPermission()
      : Promise.resolve(permission())
  try {
    if ((await requested) !== 'granted') {
      await syncPush(true)
      showToast(
        'Permite las notificaciones en los ajustes de este sitio.',
        'warn'
      )
      await dismissPush()
      return
    }
    const cfg = await config(),
      reg = await register()
    const sub=await currentSubscription(reg,cfg,true)
    state.pushDevice = { ...cfg, ...(await save(sub)) }
    lastSync = Date.now()
    lastPermission = permission()
    hide()
    repaint()
    showToast('Notificaciones activadas en este dispositivo.', 'success')
  } catch (error) {
    showToast(
      error.message || 'No se pudieron activar las notificaciones.',
      'error'
    )
  }
}
export async function dismissPush() {
  try {
    await api.post('/api/account/push/dismiss', { deviceId: device() })
    if (state.pushDevice)
      state.pushDevice.promptAfter =
        Date.now() + state.pushDevice.settings.promptMinutes * 60000
    hide()
  } catch (error) {
    showToast(error.message, 'error')
  }
}
export async function disablePush(silent = false) {
  try {
    if (supported()) {
      const reg = await navigator.serviceWorker.getRegistration('/')
      await (await reg?.pushManager.getSubscription())?.unsubscribe()
    }
    if (state.user) await api.del('/api/account/push', { deviceId: device() })
    state.pushDevice = {
      ...state.pushDevice,
      enabled: false,
      promptAfter:
        Date.now() +
        (state.pushDevice?.settings?.promptMinutes || 1440) * 60000,
    }
    if (state.user && !silent) {
      await save(null)
      await dismissPush()
    }
    hide()
    if (!silent) {
      repaint()
      showToast('Notificaciones desactivadas en este dispositivo.', 'success')
    }
  } catch (error) {
    if (!silent) showToast(error.message, 'error')
  }
}
export function startPushClient() {
  if (currentUser === state.user?.id && timer) return
  stopPushClient()
  currentUser = state.user?.id
  if (!currentUser) return
  syncPush(true)
  timer = setInterval(() => {
    if (!document.hidden) syncPush()
  }, 60000)
  if (supported() && navigator.permissions?.query)
    navigator.permissions
      .query({ name: 'notifications' })
      .then((result) => {
        permissionStatus = result
        result.onchange = () => syncPush(true)
      })
      .catch(() => {})
}
export function stopPushClient() {
  clearInterval(timer)
  timer = null
  currentUser = null
  lastSync = 0
  lastPermission = ''
  if (permissionStatus) permissionStatus.onchange = null
  hide()
  state.pushDevice = null
}
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => syncPush())
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncPush()
  })
  navigator.serviceWorker?.addEventListener('message', (event) => {
    if (event.data?.type === 'push-subscription-changed') syncPush(true)
  })
}
