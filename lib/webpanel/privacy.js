const PRIVATE_KEYS =
  /^(?:ip|last_?ip|linked_?ip|remote_?(?:ip|addr|address)|forwarded_?for|x-forwarded-for)$/i

/** También limpia el JSON serializado que se guarda en la auditoría. */
export function redactIps(value) {
  if (Array.isArray(value)) return value.map(redactIps)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !PRIVATE_KEYS.test(key))
        .map(([key, item]) => [key, redactIps(item)])
    )
  if (typeof value === 'string') {
    if (/^\s*[{[]/.test(value)) {
      try {
        return JSON.stringify(redactIps(JSON.parse(value)))
      } catch {}
    }
    return value
      .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP oculta]')
      .replace(/\b(?:[a-f\d]{0,4}:){2,}[a-f\d:.%]+\b/gi, '[IP oculta]')
  }
  return value
}
