/* Pain Panel — módulo turnstile */
import { showToast, state } from './core.js'

/* ── Cloudflare Turnstile (captcha del acceso) ──────────────────────────── */
export const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

export function cargarTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (state.turnstilePromise) return state.turnstilePromise
  state.turnstilePromise = new Promise((resolve, reject) => {
    const previo = document.querySelector('script[data-turnstile="1"]')
    if (previo) {
      previo.addEventListener('load', () => resolve(window.turnstile), { once: true })
      previo.addEventListener('error', () => reject(new Error('turnstile')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = TURNSTILE_SCRIPT
    script.async = true
    script.defer = true
    script.dataset.turnstile = '1'
    script.onload = () => resolve(window.turnstile)
    script.onerror = () => reject(new Error('turnstile'))
    document.head.appendChild(script)
  })
  return state.turnstilePromise
}

export async function montarTurnstile(siteKey) {
  state.turnstileToken = ''
  state.turnstileWidget = null
  try {
    const turnstile = await cargarTurnstile()
    const slot = document.getElementById('turnstile-slot')
    if (!turnstile || !slot) return
    slot.innerHTML = ''
    state.turnstileWidget = turnstile.render(slot, {
      sitekey: siteKey,
      theme: 'dark',
      language: 'es',
      callback: (token) => { state.turnstileToken = token || '' },
      'expired-callback': () => { state.turnstileToken = '' },
      'error-callback': () => { state.turnstileToken = '' },
    })
  } catch {
    showToast('No se pudo cargar la verificación de seguridad.', 'warn')
  }
}

export function reiniciarTurnstile() {
  state.turnstileToken = ''
  try {
    if (state.turnstileWidget && window.turnstile) window.turnstile.reset(state.turnstileWidget)
  } catch {}
}
