import {MetadataDirective, ObjectCannedACL} from '@aws-sdk/client-s3'
import {Command, Flags, ux} from '@oclif/core'
import * as path from 'node:path'

import aws from '../aws'
import * as Tarballs from '../tarballs'
import {channelAWSDir, commitAWSDir, debArch, debVersion, templateShortKey} from '../upload-util'
import {uniq} from '../util'
import {appendToIndex} from '../version-indexes'

export default class Promote extends Command {
  static description = 'promote CLI builds to a S3 release channel'

  static flags = {
    channel: Flags.string({default: 'stable', description: 'which channel to promote to', required: true}),
    deb: Flags.boolean({char: 'd', description: 'promote debian artifacts'}),
    indexes: Flags.boolean({description: 'append the promoted urls into the index files'}),
    macos: Flags.boolean({char: 'm', description: 'promote macOS pkg'}),
    'max-age': Flags.string({char: 'a', default: '86400', description: 'cache control max-age in seconds'}),
    root: Flags.string({char: 'r', default: '.', description: 'path to the oclif CLI project root', required: true}),
    sha: Flags.string({description: '7-digit short git commit SHA of the CLI to promote', required: true}),
    targets: Flags.string({char: 't', description: 'comma-separated targets to promote (e.g.: linux-arm,win32-x64)'}),
    version: Flags.string({description: 'semantic version of the CLI to promote', required: true}),
    win: Flags.boolean({char: 'w', description: 'promote Windows exe'}),
    xz: Flags.boolean({allowNo: true, description: 'also upload xz'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Promote)
    const buildConfig = await Tarballs.buildConfig(flags.root, {targets: flags?.targets?.split(',')})
    const {config, s3Config} = buildConfig
    const indexDefaults = {
      maxAge: `max-age=${flags['max-age']}`,
      s3Config,
      version: flags.version,
    }

    if (!s3Config.bucket) this.error('Cannot determine S3 bucket for promotion')

    const awsDefaults = {
      ACL: s3Config.acl ?? ObjectCannedACL.public_read,
      Bucket: s3Config.bucket,
      CacheControl: indexDefaults.maxAge,
      MetadataDirective: MetadataDirective.REPLACE,
    }
    const cloudBucketCommitKey = (shortKey: string) =>
      path.join(s3Config.bucket!, commitAWSDir(flags.version, flags.sha, s3Config), shortKey)
    const cloudChannelKey = (shortKey: string) => path.join(channelAWSDir(flags.channel, s3Config), shortKey)

    // copy tarballs manifests
    if (buildConfig.targets.length > 0) this.log(`Promoting buildmanifests & unversioned tarballs to ${flags.channel}`)

    const promoteManifest = async (target: (typeof buildConfig.targets)[number]) => {
      const manifest = templateShortKey('manifest', {
        arch: target.arch,
        bin: config.bin,
        platform: target.platform,
        sha: flags.sha,
        version: flags.version,
      })
      // strip version & sha so update/scripts can point to a static channel manifest
      const unversionedManifest = manifest.replace(`-v${flags.version}-${flags.sha}`, '')
      await aws.s3.copyObject({
        ...awsDefaults,
        CopySource: cloudBucketCommitKey(manifest),
        Key: cloudChannelKey(unversionedManifest),
      })
    }

    const promoteGzTarballs = async (target: (typeof buildConfig.targets)[number]) => {
      const versionedTarGzName = templateShortKey('versioned', {
        arch: target.arch,
        bin: config.bin,
        ext: '.tar.gz',
        platform: target.platform,
        sha: flags.sha,
        version: flags.version,
      })
      const versionedTarGzKey = cloudBucketCommitKey(versionedTarGzName)
      // strip version & sha so update/scripts can point to a static channel tarball
      const unversionedTarGzName = versionedTarGzName.replace(`-v${flags.version}-${flags.sha}`, '')
      const unversionedTarGzKey = cloudChannelKey(unversionedTarGzName)
      await Promise.all([
        aws.s3.copyObject({
          ...awsDefaults,
          CopySource: versionedTarGzKey,
          Key: unversionedTarGzKey,
        }),
        ...(flags.indexes
          ? [appendToIndex({...indexDefaults, filename: unversionedTarGzName, originalUrl: versionedTarGzKey})]
          : []),
      ])
    }

    const promoteXzTarballs = async (target: (typeof buildConfig.targets)[number]) => {
      const versionedTarXzName = templateShortKey('versioned', {
        arch: target.arch,
        bin: config.bin,
        ext: '.tar.xz',
        platform: target.platform,
        sha: flags.sha,
        version: flags.version,
      })
      const versionedTarXzKey = cloudBucketCommitKey(versionedTarXzName)
      // strip version & sha so update/scripts can point to a static channel tarball
      const unversionedTarXzName = versionedTarXzName.replace(`-v${flags.version}-${flags.sha}`, '')
      const unversionedTarXzKey = cloudChannelKey(unversionedTarXzName)
      await Promise.all([
        aws.s3.copyObject({
          ...awsDefaults,
          CopySource: versionedTarXzKey,
          Key: unversionedTarXzKey,
        }),
        ...(flags.indexes
          ? [appendToIndex({...indexDefaults, filename: unversionedTarXzName, originalUrl: versionedTarXzKey})]
          : []),
      ])
    }

    const promoteMacInstallers = async () => {
      this.log(`Promoting macos pkgs to ${flags.channel}`)
      const arches = uniq(buildConfig.targets.filter((t) => t.platform === 'darwin').map((t) => t.arch))
      await Promise.all(
        arches.map(async (arch) => {
          const darwinPkg = templateShortKey('macos', {arch, bin: config.bin, sha: flags.sha, version: flags.version})
          const darwinCopySource = cloudBucketCommitKey(darwinPkg)
          // strip version & sha so scripts can point to a static channel pkg
          const unversionedPkg = darwinPkg.replace(`-v${flags.version}-${flags.sha}`, '')
          await Promise.all([
            aws.s3.copyObject({
              ...awsDefaults,
              CopySource: darwinCopySource,
              Key: cloudChannelKey(unversionedPkg),
            }),
            ...(flags.indexes
              ? [appendToIndex({...indexDefaults, filename: unversionedPkg, originalUrl: darwinCopySource})]
              : []),
          ])
        }),
      )
    }

    const promoteWindowsInstallers = async () => {
      // copy win exe
      this.log(`Promoting windows exe to ${flags.channel}`)
      const arches = buildConfig.targets.filter((t) => t.platform === 'win32').map((t) => t.arch)
      await Promise.all(
        arches.map(async (arch) => {
          const winPkg = templateShortKey('win32', {arch, bin: config.bin, sha: flags.sha, version: flags.version})
          const winCopySource = cloudBucketCommitKey(winPkg)
          // strip version & sha so scripts can point to a static channel exe
          const unversionedExe = winPkg.replace(`-v${flags.version}-${flags.sha}`, '')
          await Promise.all([
            aws.s3.copyObject({
              ...awsDefaults,
              CopySource: winCopySource,
              Key: cloudChannelKey(unversionedExe),
            }),
            ...(flags.indexes
              ? [appendToIndex({...indexDefaults, filename: unversionedExe, originalUrl: winCopySource})]
              : []),
          ])
          ux.action.stop('successfully')
        }),
      )
    }

    const promoteDebianAptPackages = async () => {
      const arches = buildConfig.targets.filter((t) => t.platform === 'linux')

      // copy debian artifacts
      const debArtifacts = [
        ...arches
          .filter((a) => !a.arch.includes('x86')) // See todo below
          .map((a) =>
            templateShortKey('deb', {
              arch: debArch(a.arch),
              bin: config.bin,
              versionShaRevision: debVersion(buildConfig),
            }),
          ),
        'Packages.gz',
        'Packages.xz',
        'Packages.bz2',
        'Release',
        'InRelease',
        'Release.gpg',
      ]

      this.log(`Promoting debian artifacts to ${flags.channel}`)
      await Promise.all(
        debArtifacts.flatMap((artifact) => {
          const debCopySource = cloudBucketCommitKey(`apt/${artifact}`)
          const debKey = cloudChannelKey(`apt/${artifact}`)
          // apt expects ../apt/dists/versionName/[artifacts] but oclif wants varsions/sha/apt/[artifacts]
          // see https://github.com/oclif/oclif/issues/347 for the AWS-redirect that solves this
          // this workaround puts the code in both places that the redirect was doing
          // with this, the docs are correct. The copies are all done in parallel so it shouldn't be too costly.
          const workaroundKey = cloudChannelKey(`apt/./${artifact}`)
          return [
            aws.s3.copyObject({
              ...awsDefaults,
              CopySource: debCopySource,
              Key: debKey,
            }),
            aws.s3.copyObject({
              ...awsDefaults,
              CopySource: debCopySource,
              Key: workaroundKey,
            }),
          ]
        }),
      )
    }

    await Promise.all([
      ...buildConfig.targets.flatMap((target) => [
        // always promote the manifest and gz
        promoteManifest(target),
        promoteGzTarballs(target),
      ]),
      ...(flags.xz ? buildConfig.targets.map((target) => promoteXzTarballs(target)) : []),
      ...(flags.macos ? [promoteMacInstallers()] : []),
      ...(flags.win ? [promoteWindowsInstallers()] : []),
      ...(flags.deb ? [promoteDebianAptPackages()] : []),
    ])
  }
}
