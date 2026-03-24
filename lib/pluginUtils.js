export function normalizePlugin(plugin, filename) {
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


export function normalizeCommands(commands) {
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


export function isCommandMatch(pluginCommands, userCommand) {
  if (!pluginCommands || !userCommand) return false
  
  const normalizedUserCommand = userCommand.toLowerCase()
  
  return pluginCommands.some(cmd => {
    if (typeof cmd === 'string') {
      return cmd.toLowerCase() === normalizedUserCommand
    }
    if (cmd instanceof RegExp) {
      return cmd.test(normalizedUserCommand)
    }
    return false
  })
}


export function calculateSimilarity(command1, command2) {
  const cmd1 = command1.toLowerCase()
  const cmd2 = command2.toLowerCase()
  
  let score = 0
  
 
  if (cmd1 === cmd2) return 100
  
  
  if (cmd2.startsWith(cmd1)) score += 50
  if (cmd1.startsWith(cmd2)) score += 50
  
  
  if (cmd2.includes(cmd1)) score += 30
  if (cmd1.includes(cmd2)) score += 30
  
 
  let charMatches = 0
  for (let i = 0; i < Math.min(cmd1.length, cmd2.length); i++) {
    if (cmd1[i] === cmd2[i]) charMatches++
  }
  
  const charSimilarity = charMatches / Math.max(cmd1.length, cmd2.length)
  score += charSimilarity * 20
  
  return Math.min(100, score)
}


export function findBestSuggestion(userCommand, allCommands) {
  let bestSuggestion = null
  let bestScore = 0
  
  allCommands.forEach(cmd => {
    if (cmd.toLowerCase() !== userCommand.toLowerCase()) {
      const score = calculateSimilarity(userCommand, cmd)
      if (score > bestScore && score >= 10) {
        bestScore = score
        bestSuggestion = cmd
      }
    }
  })
  
  return { suggestion: bestSuggestion, score: bestScore }
}


export function validatePlugin(plugin, filename) {
  const errors = []
  
  if (!plugin) {
    errors.push('Plugin es null o undefined')
    return errors
  }
  
  if (typeof plugin.handler !== 'function' && typeof plugin !== 'function') {
    errors.push('Plugin debe tener un handler (función)')
  }
  
  if (!plugin.command && !plugin.command) {
    errors.push('Plugin debe tener comandos definidos')
  }
  
  return errors
} 