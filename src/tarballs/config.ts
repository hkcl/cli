import {Config, Interfaces, ux} from '@oclif/core'
import {exec as execSync} from 'node:child_process'
import {mkdir} from 'node:fs/promises'
import * as path from 'node:path'
import {promisify} from 'node:util'
import * as semver from 'semver'

import {templateShortKey} from '../upload-util'
import {compact} from '../util'

const exec = promisify(execSync)
export const TARGETS = ['linux-x64', 'linux-arm', 'linux-arm64', 'win32-x64', 'win32-x86', 'darwin-x64', 'darwin-arm64']

export interface BuildConfig {
  config: Interfaces.Config
  dist(input: string): string
  gitSha: string
  nodeVersion: string
  root: string
  s3Config: BuildConfig['updateConfig']['s3'] & {folder?: string; indexVersionLimit?: number}
  targets: {arch: Interfaces.ArchTypes; platform: Interfaces.PlatformTypes}[]
  tmp: string
  updateConfig: BuildConfig['config']['pjson']['oclif']['update']
  workspace(target?: {arch: Interfaces.ArchTypes; platform: Interfaces.PlatformTypes}): string
  xz: boolean
}

export async function gitSha(cwd: string, options: {short?: boolean} = {}): Promise<string> {
  const args = options.short ? ['rev-parse', '--short', 'HEAD'] : ['rev-parse', 'HEAD']
  return (await exec(`git ${args.join(' ')}`, {cwd})).stdout.trim()
}

async function Tmp(config: Interfaces.Config) {
  const tmp = path.join(config.root, 'tmp')
  await mkdir(tmp, {recursive: true})
  return tmp
}

export async function buildConfig(
  root: string,
  options: {targets?: string[]; xz?: boolean} = {},
): Promise<BuildConfig> {
  const config = await Config.load({devPlugins: false, root: path.resolve(root), userPlugins: false})
  root = config.root
  const _gitSha = await gitSha(root, {short: true})
  // eslint-disable-next-line new-cap
  const tmp = await Tmp(config)
  const updateConfig = config.pjson.oclif.update || {}
  updateConfig.s3 = updateConfig.s3 || {}
  const nodeVersion = updateConfig.node.version || process.versions.node
  const targets = compact(options.targets || updateConfig.node.targets || TARGETS)
    .filter((t) => {
      if (t === 'darwin-arm64' && semver.lt(nodeVersion, '16.0.0')) {
        ux.warn('darwin-arm64 is only supported for node >=16.0.0. Skipping...')
        return false
      }

      return true
    })
    .map((t) => {
      const [platform, arch] = t.split('-') as [Interfaces.PlatformTypes, Interfaces.ArchTypes]
      return {arch, platform}
    })
  return {
    config,
    dist: (...args: string[]) => path.join(config.root, 'dist', ...args),
    gitSha: _gitSha,
    nodeVersion,
    root,
    s3Config: updateConfig.s3,
    targets,
    tmp,
    updateConfig,
    workspace(target) {
      const base = path.join(config.root, 'tmp')
      if (target && target.platform)
        return path.join(base, [target.platform, target.arch].join('-'), templateShortKey('baseDir', {bin: config.bin}))
      return path.join(base, templateShortKey('baseDir', {bin: config.bin}))
    },
    xz: options?.xz ?? updateConfig?.s3?.xz ?? true,
  }
}
