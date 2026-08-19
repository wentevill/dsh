import { mkdirSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'

/** Build a package-manager environment with no inherited host config, proxy, or Node injection. */
export function buildHermeticEnvironment({ root, dshHome, nodeBin, packageBin, offline, home, xdgDataHome, storeDir }) {
  const resolvedHome = home ?? join(root, 'home')
  const resolvedXdgDataHome = xdgDataHome === undefined ? join(root, 'xdg-data') : xdgDataHome
  const paths = {
    cache: join(root, 'cache'),
    tmp: join(root, 'tmp'),
    xdgConfig: join(root, 'xdg-config'),
    xdgState: join(root, 'xdg-state'),
    runtime: join(root, 'xdg-runtime'),
  }
  for (const path of [resolvedHome, resolvedXdgDataHome, storeDir, ...Object.values(paths)]) {
    if (path !== null && path !== undefined) mkdirSync(path, { recursive: true })
  }
  const userConfig = join(root, 'empty-npmrc')
  writeFileSync(userConfig, '')
  return {
    CI: 'true',
    HOME: resolvedHome,
    DSH_HOME: dshHome,
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    PATH: [nodeBin, packageBin, '/usr/bin', '/bin'].join(delimiter),
    TMPDIR: paths.tmp,
    XDG_CACHE_HOME: paths.cache,
    XDG_CONFIG_HOME: paths.xdgConfig,
    ...(resolvedXdgDataHome === null ? {} : { XDG_DATA_HOME: resolvedXdgDataHome }),
    XDG_STATE_HOME: paths.xdgState,
    XDG_RUNTIME_DIR: paths.runtime,
    npm_config_cache: paths.cache,
    ...(storeDir === undefined ? {} : { npm_config_store_dir: storeDir }),
    npm_config_userconfig: userConfig,
    ...(offline ? { npm_config_offline: 'true' } : {}),
  }
}
