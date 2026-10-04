const SHARP_VERSION = '0.34.1'
const LIBVIPS_VERSION = '1.1.0'

export function sharpInstallPlan(android, { platform, arch, libc = '' } = process) {
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
  } else if (platform === 'linux') {
    const runtime = `linux${libc === 'musl' ? 'musl' : ''}-${arch}`
    if (['linux-arm', 'linux-arm64', 'linux-s390x', 'linux-x64',
      'linuxmusl-arm64', 'linuxmusl-x64'].includes(runtime)) {
      args.push(
        `@img/sharp-${runtime}@${SHARP_VERSION}`,
        `@img/sharp-libvips-${runtime}@${LIBVIPS_VERSION}`
      )
    }
  }

  return { args, env }
}
