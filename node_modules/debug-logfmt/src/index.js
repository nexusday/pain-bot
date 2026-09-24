'use strict'

const origDebug = require('debug')

const timeSpan = require('@kikobeats/time-span')({
  format: require('pretty-ms')
})

const encode = require('./encode')

/**
 * This methods override the default `formatArgs` to don't print diff information.
 */
if (process.env.DEBUG_COLORS === 'false') {
  origDebug.formatArgs = function formatArgs (args) {
    args[0] = this.namespace + ' ' + args[0]
  }
} else {
  origDebug.formatArgs = function formatArgs (args) {
    const colorCode = `\u001B[3${this.color < 8 ? this.color : `8;5;${this.color}`}`
    const prefix = `  ${colorCode};1m${this.namespace} \u001B[0m`
    args[0] = prefix + args[0].replace(/\n/g, `\n${prefix}`)
  }
}

const createDebug = require('./lazy')(origDebug)

const LEVELS = ['info', 'warn', 'error']

const createLogger = log => {
  const logger = (...args) => {
    if (!log.enabled) return

    log(
      args.reduce((result, arg, index) => {
        const encoded = typeof arg === 'string' ? arg : encode(arg)
        if (!encoded) return result
        return result + (index > 0 ? ' ' : '') + encoded
      }, '')
    )
  }

  Object.defineProperty(logger, 'enabled', {
    enumerable: true,
    get: () => log.enabled
  })

  return logger
}

module.exports = (env, { levels = LEVELS } = {}) => {
  const debug = createLogger(createDebug(env))
  levels.forEach(level => (debug[level] = createLogger(createDebug(`${env}:${level}`))))

  debug.duration = (...args) => {
    let duration = debug.enabled ? timeSpan() : undefined

    const create =
      logger =>
        (...opts) => {
          if (!logger.enabled) return true

          duration = duration || timeSpan()

          logger(...args, ...opts, {
            duration: duration()
          })

          return true
        }

    const fn = create(debug)
    fn.error = create(debug.error)
    fn.info = create(debug.info)

    return fn
  }

  return debug
}

module.exports.timeSpan = timeSpan
