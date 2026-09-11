export function normalizarPlugin(plugin, filename) {
  if (!plugin) return null

  if (typeof plugin === 'function') {
    return {
      name: filename,
      handler: plugin,
      command: plugin.command || [],
      tags: plugin.tags || [],
      help: plugin.help || [],
      all: plugin.all,
      customPrefix: plugin.customPrefix,
      disabled: false
    }
  }

  return {
    name: filename,
    handler: plugin.handler || plugin,
    command: plugin.command || [],
    tags: plugin.tags || [],
    help: plugin.help || [],
    all: plugin.all,
    customPrefix: plugin.customPrefix,
    disabled: plugin.disabled || false
  }
}

export function normalizarComandos(commands) {
  if (!commands) return []

  if (typeof commands === 'string') {
    return [commands]
  }

  if (Array.isArray(commands)) {
    return commands.map(cmd => {
      if (typeof cmd === 'string') {
        return cmd.toLowerCase()
      }
      if (cmd instanceof RegExp) {
        return cmd.source
      }
      return String(cmd).toLowerCase()
    })
  }

  if (commands instanceof RegExp) {
    return [commands.source]
  }

  return []
}

export function esCoincidenciaComando(pluginCommands, userCommand) {
  if (!pluginCommands || !userCommand) return false

  const comandoUsuarioNormalizado = userCommand.toLowerCase()

  return pluginCommands.some(cmd => {
    if (typeof cmd === 'string') {
      return cmd.toLowerCase() === comandoUsuarioNormalizado
    }
    if (cmd instanceof RegExp) {
      return cmd.test(comandoUsuarioNormalizado)
    }
    return false
  })
}

export function calcularSimilitud(command1, command2) {
  const cmd1 = command1.toLowerCase()
  const cmd2 = command2.toLowerCase()

  let puntuacion = 0

  if (cmd1 === cmd2) return 100

  if (cmd2.startsWith(cmd1)) puntuacion += 50
  if (cmd1.startsWith(cmd2)) puntuacion += 50

  if (cmd2.includes(cmd1)) puntuacion += 30
  if (cmd1.includes(cmd2)) puntuacion += 30

  let coincidenciasChar = 0
  for (let i = 0; i < Math.min(cmd1.length, cmd2.length); i++) {
    if (cmd1[i] === cmd2[i]) coincidenciasChar++
  }

  const similitudChar = coincidenciasChar / Math.max(cmd1.length, cmd2.length)
  puntuacion += similitudChar * 20

  return Math.min(100, puntuacion)
}

export function buscarMejorSugerencia(userCommand, allCommands) {
  let mejorSugerencia = null
  let mejorPuntuacion = 0

  allCommands.forEach(cmd => {
    if (cmd.toLowerCase() !== userCommand.toLowerCase()) {
      const puntuacion = calcularSimilitud(userCommand, cmd)
      if (puntuacion > mejorPuntuacion && puntuacion >= 10) {
        mejorPuntuacion = puntuacion
        mejorSugerencia = cmd
      }
    }
  })

  return { suggestion: mejorSugerencia, score: mejorPuntuacion }
}

export function validarPlugin(plugin, filename) {
  const errores = []

  if (!plugin) {
    errores.push('Plugin es null o undefined')
    return errores
  }

  if (typeof plugin.handler !== 'function' && typeof plugin !== 'function') {
    errores.push('Plugin debe tener un handler (función)')
  }

  if (!plugin.command && !plugin.command) {
    errores.push('Plugin debe tener comandos definidos')
  }

  return errores
}

export {
  normalizarPlugin as normalizePlugin,
  normalizarComandos as normalizeCommands,
  esCoincidenciaComando as isCommandMatch,
  calcularSimilitud as calculateSimilarity,
  buscarMejorSugerencia as findBestSuggestion,
  validarPlugin as validatePlugin
}
