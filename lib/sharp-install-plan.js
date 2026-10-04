const SHARP_VERSION = '0.34.1'
const LIBVIPS_VERSION = '1.1.0'

export function sharpInstallPlan(android, { platform, arch, libc = '' } = process) {
  const packages = []
  const args = []
  const env = {}

  if (android) {
    args.push(
      'install',
      '--no-save',
      '--package-lock=false',
      '--include=optional',
      '--no-audit',
      '--no-fund',
      `sharp@${SHARP_VERSION}`,
      `@img/sharp-wasm32@${SHARP_VERSION}`,
      '--cpu=wasm32',
      '--no-bin-links'
    )
    env.npm_config_cpu = 'wasm32'
  } else if (platform === 'linux') {
    const libcRuntime = libc === 'musl' ? 'musl' : ''
    const runtime = `linux${libcRuntime}-${arch}`
    if (['linux-arm', 'linux-arm64', 'linux-s390x', 'linux-x64',
      'linuxmusl-arm64', 'linuxmusl-x64'].includes(runtime)) {
      packages.push(
        { name: `sharp-${runtime}`, version: SHARP_VERSION, file: `lib/sharp-${runtime}.node` },
        { name: `sharp-libvips-${runtime}`, version: LIBVIPS_VERSION, file: 'lib' }
      )
    }
  }

  return { args, env, packages }
}
