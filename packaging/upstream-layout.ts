import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

export const ARCHIVE_COMMIT = '2c4cf69b2f'
export const ARCHIVE_REF = 'refs/heads/archive/desktop-packaging-20260818'

interface MigrationExpectation {
  readonly expectedHead?: string
  readonly expectedArchive?: string
}

function git(sourceDir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', resolve(sourceDir), ...args], { encoding: 'utf8' }).trim()
}

/** Verify that migration starts from the exact preserved, clean source state. */
export function assertMigrationSource(
  sourceDir: string,
  expectation: MigrationExpectation = {},
): { head: string; upstreamHead: string } {
  const expectedHead = expectation.expectedHead ?? ARCHIVE_COMMIT
  const expectedArchive = expectation.expectedArchive ?? ARCHIVE_COMMIT
  const head = git(sourceDir, 'rev-parse', 'HEAD')
  if (!head.startsWith(expectedHead) && !expectedHead.startsWith(head)) {
    throw new Error(`packaging: expected migration commit ${expectedHead}, got ${head}`)
  }
  const status = git(sourceDir, 'status', '--porcelain')
  if (status !== '') throw new Error('packaging: source working tree is not clean')
  const archive = git(sourceDir, 'rev-parse', ARCHIVE_REF)
  if (!archive.startsWith(expectedArchive) && !expectedArchive.startsWith(archive)) {
    throw new Error(`packaging: ${ARCHIVE_REF} must preserve ${expectedArchive}, got ${archive}`)
  }
  return { head, upstreamHead: git(sourceDir, 'rev-parse', 'origin/master') }
}
