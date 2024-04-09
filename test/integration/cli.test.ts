import {expect} from 'chai'
import {existsSync} from 'node:fs'
import {mkdir, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {exec} from './util'

const MODULE_TYPE = process.env.OCLIF_INTEGRATION_MODULE_TYPE || 'CommonJS'
const PACKAGE_MANAGER = process.env.OCLIF_INTEGRATION_PACKAGE_MANAGER || 'npm'
const nodeVersion = process.version

describe(`Generated CLI Integration Tests ${MODULE_TYPE} + ${PACKAGE_MANAGER} + node ${nodeVersion}`, () => {
  const tmpDir = join(tmpdir(), `generated-cli-integration-tests-${MODULE_TYPE}-${PACKAGE_MANAGER}-node-${nodeVersion}`)
  const executable = join(process.cwd(), 'bin', process.platform === 'win32' ? 'dev.cmd' : 'dev.js')
  const cliName = 'mycli'
  const cliDir = join(tmpDir, cliName)
  let cliBinRun: string
  let cliBinDev: string

  function setBins(): void {
    const usesJsScripts = existsSync(join(cliDir, 'bin', 'run.js'))
    const extension = process.platform === 'win32' ? '.cmd' : usesJsScripts ? '.js' : ''
    cliBinRun = join(tmpDir, cliName, 'bin', `run${extension}`)
    cliBinDev = join(tmpDir, cliName, 'bin', `dev${extension}`)
  }

  before(async () => {
    console.log('tmpDir:', tmpDir)
    await rm(tmpDir, {force: true, recursive: true})
    await mkdir(tmpDir, {recursive: true})
  })

  it('should generate a CLI', async () => {
    const genResult = await exec(
      `${executable} generate ${cliName} --yes --module-type ${MODULE_TYPE} --package-manager ${PACKAGE_MANAGER}`,
      {cwd: tmpDir},
    )
    expect(genResult.code).to.equal(0)
    expect(genResult.stdout).to.include(`Created ${cliName}`)

    setBins()

    const result = await exec(`${cliBinRun} hello world`, {cwd: cliDir})
    expect(result.code).to.equal(0)
    expect(result.stdout).to.equal('hello world! (./src/commands/hello/world.ts)\n')

    if (PACKAGE_MANAGER === 'yarn') {
      expect(existsSync(join(cliDir, 'yarn.lock'))).to.be.true
    }

    if (PACKAGE_MANAGER === 'npm') {
      expect(existsSync(join(cliDir, 'package-lock.json'))).to.be.true
      expect(existsSync(join(cliDir, 'yarn.lock'))).to.be.false
    }

    if (PACKAGE_MANAGER === 'pnpm') {
      expect(existsSync(join(cliDir, 'pnpm-lock.yaml'))).to.be.true
      expect(existsSync(join(cliDir, 'yarn.lock'))).to.be.false
    }
  })

  it('should generate a new command', async () => {
    const genResult = await exec(`${executable} generate command foo:bar:baz --force`, {cwd: cliDir})
    expect(genResult.code).to.equal(0)

    const result = await exec(`${cliBinDev} foo:bar:baz`, {cwd: cliDir})
    expect(result.code).to.equal(0)
    expect(result.stdout).to.include('hello world')
  })

  it('should generate a new hook', async () => {
    const genResult = await exec(`${executable} generate hook init --event init --force`, {cwd: cliDir})
    expect(genResult.code).to.equal(0)

    const result = await exec(`${cliBinDev} foo:bar:baz`, {cwd: cliDir})
    expect(result.code).to.equal(0)
    expect(result.stdout).to.include('example hook running foo:bar:baz\n')
  })

  it('should generate a README', async () => {
    const genResult = await exec(`${executable} readme`, {cwd: cliDir})
    expect(genResult.code).to.equal(0)

    if (process.platform !== 'win32') {
      // TODO: fix this test on Windows
      const contents = await readFile(join(cliDir, 'README.md'), 'utf8')

      // Ensure that the README doesn't contain any references to the dist/ folder
      const distRegex = /dist\//g
      const distMatches = contents.match(distRegex)
      expect(distMatches).to.be.null

      const srcRegex = /src\//g
      const srcMatches = contents.match(srcRegex)
      expect(srcMatches).to.not.be.null
    }
  })

  it('should generate passing tests', async () => {
    const result = await exec(`${PACKAGE_MANAGER} run test`, {cwd: cliDir})
    expect(result.code).to.equal(0)
    expect(result.stdout).to.include('5 passing')
  })
})
