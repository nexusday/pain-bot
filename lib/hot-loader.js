const raiz = decodeURIComponent(new URL('..', import.meta.url).pathname)
  .replace(/\\/g, '/')
  .toLowerCase()

function esCodigoDelBot(url) {
  if (!url || !url.startsWith('file:') || url.includes('hot=')) return false
  let ruta = ''
  try {
    ruta = decodeURIComponent(new URL(url).pathname).replace(/\\/g, '/').toLowerCase()
  } catch {
    return false
  }
  if (!ruta.startsWith(raiz) || ruta.includes('/node_modules/')) return false
  if (ruta.endsWith('/handler.js')) return true
  return ruta.includes('/lib/') && ruta.endsWith('.js')
}

export async function resolve(specifier, context, nextResolve) {
  const result = await nextResolve(specifier, context)
  const epoca = globalThis.__HOT_EPOCH
  if (!epoca || !esCodigoDelBot(result?.url)) return result
  const url = new URL(result.url)
  url.searchParams.set('hot', String(epoca))
  return { ...result, url: url.href }
}
