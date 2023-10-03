import {Command, Flags, Interfaces} from '@oclif/core'
import * as fs from 'node:fs'

import aws from '../../aws'
import {log} from '../../log'
import * as Tarballs from '../../tarballs'
import {commitAWSDir, templateShortKey} from '../../upload-util'
import {uniq} from '../../util'

export default class UploadMacos extends Command {
  static description = 'upload macos installers built with pack:macos'

  static flags = {
    root: Flags.string({char: 'r', default: '.', description: 'path to oclif CLI root', required: true}),
    targets: Flags.string({
      char: 't',
      description: 'comma-separated targets to upload (e.g.: darwin-x64,darwin-arm64)',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(UploadMacos)
    const buildConfig = await Tarballs.buildConfig(flags.root, {targets: flags?.targets?.split(',')})
    const {config, dist, s3Config} = buildConfig
    const S3Options = {
      ACL: s3Config.acl || 'public-read',
      Bucket: s3Config.bucket!,
    }
    const cloudKeyBase = commitAWSDir(config.version, buildConfig.gitSha, s3Config)

    const upload = async (arch: Interfaces.ArchTypes) => {
      const templateKey = templateShortKey('macos', {
        arch,
        bin: config.bin,
        sha: buildConfig.gitSha,
        version: config.version,
      })
      const cloudKey = `${cloudKeyBase}/${templateKey}`
      const localPkg = dist(`macos/${templateKey}`)

      if (fs.existsSync(localPkg))
        await aws.s3.uploadFile(localPkg, {...S3Options, CacheControl: 'max-age=86400', Key: cloudKey})
      else
        this.error('Cannot find macOS pkg', {
          suggestions: ['Run "oclif pack macos" before uploading'],
        })
    }

    const arches = uniq(buildConfig.targets.filter((t) => t.platform === 'darwin').map((t) => t.arch))
    await Promise.all(arches.map((a) => upload(a)))

    log(`done uploading macos pkgs for v${config.version}-${buildConfig.gitSha}`)
  }
}
