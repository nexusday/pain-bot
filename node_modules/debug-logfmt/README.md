# debug-logfmt

<div align="center">
	<img width="800" src="https://i.imgur.com/R0cd2Gj.png" >
</div>

## Highlights

- Based on the popular [`debug`](https://www.npmjs.com/package/debug) module.
- Lazy level evaluation used logs levels.
- Level support: `info`, `warn` & `error` based from [RFC 5424](https://datatracker.ietf.org/doc/html/rfc5424).
- Message formatting Heroku [logfmt](https://brandur.org/logfmt) syntax.
- Colorized output via [`DEBUG_COLORS`](https://github.com/debug-js/debug#environment-variables) by default.
- [`debug.duration`](#measurement) for measurement.

## Install

```bash
$ npm install debug debug-logfmt --save
```

## Usage

### Multiple levels

Given a code like this one:

```js
const debug = require('debug-logfmt')('metascraper')

debug('retry', { url: 'https://kikobeats.com' })
debug.info('done', { time: Date.now() })
debug.warn('token expired', { timestamp: Date.now() })
debug.error('whoops', { message: 'expected `number`, got `NaN`' })
```

You can:
- Allow all the levels: `DEBUG=debug-logfmt*`
- Discard specific levels: `DEBUG="*,-metascraper:info*" node example.js`

### Measurement

Sometimes you need to log the duration of a function:

```js
const { setTimeout } = require('timers/promises')

const debug = require('debug-logfmt')('metascraper')

const duration = debug.duration()

setTimeout(1001).then(() => duration.error('timeout!'))
setTimeout(1100).then(() => duration.info('success'))
```

## API

### debug(env, [options])

#### env

*Required*<br>
Type: `string`

The env variable name to use for enabling logging using `DEBUG`.

#### options

##### levels

Type: `array`<br>
Default: `['debug', 'info', 'warn', 'error']`

The log levels available.

### debug.duration([...args])

It returns a function will print the duration in the next call.

```js
const duration = debug.duration('query')
const result = await db.query(query)
duration(result)
```

## License

**debug-logfmt** © [Kiko Beats](https://kikobeats.com), released under the [MIT](https://github.com/Kikobeats/debug-logfmt/blob/master/LICENSE.md) License.<br>
Authored and maintained by Kiko Beats with help from [contributors](https://github.com/Kikobeats/debug-logfmt/contributors).

> [kikobeats.com](https://kikobeats.com) · GitHub [Kiko Beats](https://github.com/Kikobeats) · X [@Kikobeats](https://x.com/Kikobeats)
