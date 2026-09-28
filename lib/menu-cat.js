function tituloDe(linea) {
  const limpio = String(linea || '').trim().replace(/^[`*]+|[`*]+$/g, '')
  const hallado = limpio.match(/^˚\s+✩\s+(.+?)\s+✩\s+˚$/)
  return hallado ? hallado[1].trim() : null
}

function comandoDe(linea) {
  const hallado = String(linea || '').trim().match(/^>\s*`([^`]+)`\s*$/)
  return hallado ? hallado[1].trim() : null
}

function sinPrefijo(texto, prefix) {
  const marca = String(prefix || '')
  if (marca && texto.startsWith(marca)) return texto.slice(marca.length)
  return texto
}

function partirComando(texto, prefix) {
  const cuerpo = sinPrefijo(texto, prefix).trim()
  const corte = cuerpo.search(/\s/)
  if (corte === -1) return { nombre: cuerpo, uso: '' }
  return { nombre: cuerpo.slice(0, corte), uso: cuerpo.slice(corte + 1).trim() }
}

function esChip(texto, prefix) {
  const cuerpo = sinPrefijo(texto, prefix)
  return cuerpo.length <= 18 && !/[<@|]/.test(cuerpo)
}

function partirCuerpo(texto) {
  const bloques = []
  let titulo = ''
  for (const linea of String(texto || '').split('\n')) {
    const limpia = linea.trim()
    if (!limpia) continue
    const tituloLinea = tituloDe(limpia)
    if (tituloLinea) {
      titulo = tituloLinea
      continue
    }
    const comando = comandoDe(limpia)
    if (comando) {
      bloques.push({ tipo: 'cmd', texto: comando })
      continue
    }
    bloques.push({ tipo: 'nota', texto: limpia })
  }
  return { titulo, bloques }
}

function empaquetar(nombres) {
  const lineas = []
  let actual = []
  let largo = 0
  for (const nombre of nombres) {
    const suma = largo + (actual.length ? 3 : 0) + nombre.length
    if (actual.length && (actual.length >= 3 || suma > 36)) {
      lineas.push(actual.join(' · '))
      actual = [nombre]
      largo = nombre.length
    } else {
      actual.push(nombre)
      largo = actual.length === 1 ? nombre.length : suma
    }
  }
  if (actual.length) lineas.push(actual.join(' · '))
  return lineas
}

function grupos(partes, prefix) {
  const lineas = []
  if (partes.titulo) lineas.push(partes.titulo, '')
  let bolsa = []
  const vaciar = () => {
    if (!bolsa.length) return
    lineas.push(...empaquetar(bolsa))
    bolsa = []
  }
  for (const bloque of partes.bloques) {
    if (bloque.tipo === 'nota') {
      vaciar()
      lineas.push(bloque.texto)
      continue
    }
    if (esChip(bloque.texto, prefix)) {
      bolsa.push(sinPrefijo(bloque.texto, prefix))
      continue
    }
    vaciar()
    const { nombre, uso } = partirComando(bloque.texto, prefix)
    lineas.push(uso ? `${nombre}  ${uso}` : nombre)
  }
  vaciar()
  return lineas.join('\n').trim()
}

function lista(partes, prefix) {
  const lineas = []
  if (partes.titulo) lineas.push(`│ ${partes.titulo}`, '')
  for (const bloque of partes.bloques) {
    if (bloque.tipo === 'nota') {
      lineas.push(bloque.texto)
      continue
    }
    const { nombre, uso } = partirComando(bloque.texto, prefix)
    lineas.push(uso ? `│ ${nombre}  ${uso}` : `│ ${nombre}`)
  }
  return lineas.join('\n').trim()
}

function uso(partes, prefix) {
  const lineas = []
  if (partes.titulo) lineas.push(partes.titulo, '')
  for (const bloque of partes.bloques) {
    if (bloque.tipo === 'nota') {
      lineas.push(bloque.texto)
      continue
    }
    const pieza = partirComando(bloque.texto, prefix)
    if (!pieza.uso) {
      lineas.push(pieza.nombre)
      continue
    }
    const hueco = Math.max(2, 16 - pieza.nombre.length)
    lineas.push(`${pieza.nombre}${' '.repeat(hueco)}${pieza.uso}`)
  }
  return lineas.join('\n').trim()
}

function plano(partes) {
  const lineas = []
  if (partes.titulo) lineas.push(partes.titulo, '')
  for (const bloque of partes.bloques) lineas.push(bloque.texto)
  return lineas.join('\n').trim()
}

/** El `1` devuelve el texto tal cual. Si no reconoce comandos, tampoco lo toca. */
export function aplicarEstiloCategoria(texto, estilo, prefix = '/') {
  const modo = String(estilo || '1')
  if (modo === '1' || !texto) return texto
  const partes = partirCuerpo(texto)
  if (!partes.bloques.some(bloque => bloque.tipo === 'cmd')) return texto
  if (modo === '2') return grupos(partes, prefix)
  if (modo === '3') return lista(partes, prefix)
  if (modo === '4') return uso(partes, prefix)
  if (modo === '5') return plano(partes)
  return texto
}
