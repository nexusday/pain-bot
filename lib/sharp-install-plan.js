const SHARP_VERSION = '0.34.1'

export function sharpInstallPlan(android) {
  const args = [
    'install',
    '--no-save',
    '--package-lock=false',
    '--include=optional',
    '--no-audit',
    '--no-fund',
    `sharp@${SHARP_VERSION}`
  ]
  const env = {}

  if (android) {
    args.push(`@img/sharp-wasm32@${SHARP_VERSION}`, '--cpu=wasm32', '--no-bin-links')
    env.npm_config_cpu = 'wasm32'
  }

  return { args, env }
}
