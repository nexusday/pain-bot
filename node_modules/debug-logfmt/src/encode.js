function stringify (input) {
  if (typeof input !== 'string') input = String(input)
  if (input === '') return '""'
  let encoded = input.split(/\n/g).join(' ')
  if (/["\\]/.test(encoded)) encoded = encoded.replace(/["\\]/g, '\\$&')
  if (/[\s=]/.test(encoded)) encoded = `"${encoded}"`
  return encoded
}

module.exports = obj => {
  let result = ''
  let i = 0
  for (const key in obj) result += (i++ ? ' ' : '') + `${key}=${stringify(obj[key])}`
  return result
}
