import { mkdirSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'

/** Build a package-manager environment with no inherited host config, proxy, or Node injection. */
export function buildHermeticEnvironment({ root, dshHome, nodeBin, packageBin, offline }) {
  const paths = {
    home: join(root, 'home'),
    cache: join(root, 'cache'),
    store: join(root, 'store'),
    tmp: join(root, 'tmp'),
    xdgConfig: join(root, 'xdg-config'),
    xdgData: join(root, 'xdg-data'),
    xdgState: join(root, 'xdg-state'),
    runtime: join(root, 'xdg-runtime'),
  }
  for (const path of Object.values(paths)) mkdirSync(path, { recursive: true })
  const userConfig = join(root, 'empty-npmrc')
  writeFileSync(userConfig, '')
  return {
    CI: 'true',
    HOME: paths.home,
    DSH_HOME: dshHome,
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    PATH: [nodeBin, packageBin, '/usr/bin', '/bin'].join(delimiter),
    TMPDIR: paths.tmp,
    XDG_CACHE_HOME: paths.cache,
    XDG_CONFIG_HOME: paths.xdgConfig,
    XDG_DATA_HOME: paths.xdgData,
    XDG_STATE_HOME: paths.xdgState,
    XDG_RUNTIME_DIR: paths.runtime,
    npm_config_cache: paths.cache,
    npm_config_store_dir: paths.store,
    npm_config_userconfig: userConfig,
    ...(offline ? { npm_config_offline: 'true' } : {}),
  }
}
