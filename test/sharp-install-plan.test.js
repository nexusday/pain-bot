import test from 'node:test'
import assert from 'node:assert/strict'
import { sharpInstallPlan } from '../lib/sharp-install-plan.js'

test('installs optional native Sharp runtime for the current host', () => {
  const plan = sharpInstallPlan(false)

  assert.deepEqual(plan.args, [
    'install',
    '--no-save',
    '--package-lock=false',
    '--include=optional',
    '--no-audit',
    '--no-fund',
    'sharp@0.34.1'
  ])
  assert.deepEqual(plan.env, {})
})

test('keeps the wasm-only install plan for Android and Termux', () => {
  const plan = sharpInstallPlan(true, { platform: 'android', arch: 'arm64' })

  assert.ok(plan.args.includes('sharp@0.34.1'))
  assert.ok(plan.args.includes('@img/sharp-wasm32@0.34.1'))
  assert.ok(plan.args.includes('--cpu=wasm32'))
  assert.equal(plan.env.npm_config_cpu, 'wasm32')
  assert.ok(plan.args.includes('--include=optional'))
  assert.ok(plan.args.includes('--package-lock=false'))
})

test('explicitly installs the Linux x64 Sharp and libvips runtime packages', () => {
  const plan = sharpInstallPlan(false, { platform: 'linux', arch: 'x64', libc: 'glibc' })

  assert.ok(plan.args.includes('@img/sharp-linux-x64@0.34.1'))
  assert.ok(plan.args.includes('@img/sharp-libvips-linux-x64@1.1.0'))
  assert.ok(plan.args.includes('--os=linux'))
  assert.ok(plan.args.includes('--cpu=x64'))
  assert.ok(plan.args.includes('--libc=glibc'))
  assert.deepEqual(plan.env, {
    npm_config_os: 'linux',
    npm_config_arch: 'x64',
    npm_config_libc: 'glibc'
  })
})

test('selects the musl runtime when the Linux container uses musl', () => {
  const plan = sharpInstallPlan(false, { platform: 'linux', arch: 'x64', libc: 'musl' })

  assert.ok(plan.args.includes('@img/sharp-linuxmusl-x64@0.34.1'))
  assert.ok(plan.args.includes('@img/sharp-libvips-linuxmusl-x64@1.1.0'))
  assert.ok(plan.args.includes('--libc=musl'))
})
