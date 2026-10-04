import test from 'node:test'
import assert from 'node:assert/strict'
import { sharpInstallPlan } from '../lib/sharp-install-plan.js'

test('keeps the wasm-only install plan for Android and Termux', () => {
  const plan = sharpInstallPlan(true, { platform: 'android', arch: 'arm64' })

  assert.ok(plan.args.includes('sharp@0.34.1'))
  assert.ok(plan.args.includes('@img/sharp-wasm32@0.34.1'))
  assert.ok(plan.args.includes('--cpu=wasm32'))
  assert.equal(plan.env.npm_config_cpu, 'wasm32')
  assert.ok(plan.args.includes('--include=optional'))
  assert.ok(plan.args.includes('--package-lock=false'))
  assert.deepEqual(plan.packages, [])
})

test('explicitly installs the Linux x64 Sharp and libvips runtime packages', () => {
  const plan = sharpInstallPlan(false, { platform: 'linux', arch: 'x64', libc: 'glibc' })

  assert.deepEqual(plan.packages, [
    { name: 'sharp-linux-x64', version: '0.34.1', file: 'lib/sharp-linux-x64.node' },
    { name: 'sharp-libvips-linux-x64', version: '1.1.0', file: 'lib' }
  ])
  assert.deepEqual(plan.args, [])
  assert.deepEqual(plan.env, {})
})

test('selects the musl runtime when the Linux container uses musl', () => {
  const plan = sharpInstallPlan(false, { platform: 'linux', arch: 'x64', libc: 'musl' })

  assert.deepEqual(plan.packages.map((pkg) => pkg.name), [
    'sharp-linuxmusl-x64',
    'sharp-libvips-linuxmusl-x64'
  ])
  assert.equal(plan.packages[0].file, 'lib/sharp-linuxmusl-x64.node')
})

test('fails closed on unsupported Linux architecture instead of guessing a runtime', () => {
  const plan = sharpInstallPlan(false, { platform: 'linux', arch: 'riscv64', libc: 'glibc' })

  assert.deepEqual(plan.packages, [])
  assert.deepEqual(plan.args, [])
})
