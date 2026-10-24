// Las dos fuentes de la versión del panel deben ir siempre sincronizadas:
// - lib/webpanel/panel-config.js (la que reporta el servidor en /api/config)
// - webpanel/public/assets/js/core.js (la que hornea el código del navegador)
// Si se desincronizan, el banner "Hay una versión nueva del panel" aparece
// para siempre aunque el cliente cargue el código nuevo. Este test existió
// por ese desastre: código 1.9.0 en el navegador contra 1.9.1 del servidor.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const versionDeServidor = () => {
  const texto = fs.readFileSync(path.join(raiz, 'lib/webpanel/panel-config.js'), 'utf8')
  const m = texto.match(/version:\s*'(\d+(?:\.\d+)+)'/)
  assert.ok(m, 'no se encontró la versión en lib/webpanel/panel-config.js')
  return m[1]
}

const versionDelNavegador = () => {
  const texto = fs.readFileSync(path.join(raiz, 'webpanel/public/assets/js/core.js'), 'utf8')
  const m = texto.match(/export const PANEL_VERSION\s*=\s*'(\d+(?:\.\d+)+)'/)
  assert.ok(m, 'no se encontró PANEL_VERSION en webpanel/public/assets/js/core.js')
  return m[1]
}

test('la versión del panel está sincronizada entre servidor y navegador', () => {
  const servidor = versionDeServidor()
  const navegador = versionDelNavegador()
  assert.equal(
    navegador,
    servidor,
    `Desincronizadas: servidor v${servidor} (panel-config.js) vs navegador v${navegador} (core.js PANEL_VERSION). ` +
    `Actualiza las DOS al mismo tiempo o el banner de versión se queda pegado en el panel.`
  )
})

// index.html histórico llevaba ?v=rígido en cada asset: con Cache-Control:
// no-cache + ETag ya se revalida con un F5 normal y el ?v solo añadía otra
// versión a mano que se quedaba Vieja en cada subida.
test('index.html no referencia assets con versión fija (?v=)', () => {
  const texto = fs.readFileSync(path.join(raiz, 'webpanel/public/index.html'), 'utf8')
  assert.ok(!texto.includes('?v='), 'index.html vuelve a tener ?v=; los assets se revalidan sola con ETag (no-cache).')
})
