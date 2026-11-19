'use strict';
const fs = require('node:fs');
const path = require('node:path');

function runtimeConfig(appDir = path.resolve(__dirname, '..'), env = process.env) {
  const gitEntry = path.join(appDir, '..', '.git');
  const worktree = fs.existsSync(gitEntry) && fs.statSync(gitEntry).isFile();
  const preview = worktree || env.HEREME_PREVIEW === '1';
  const dataDir = env.HEREME_DATA_DIR
    ? path.resolve(env.HEREME_DATA_DIR)
    : path.join(appDir, 'data', ...(preview ? ['preview'] : []));
  if (preview && !env.HEREME_DATA_DIR && !fs.existsSync(path.join(dataDir, 'hereme.sqlite'))) {
    throw new Error(`Preview snapshot missing at ${dataDir}. Follow docs/migration.md before starting this worktree.`);
  }
  const port = env.PORT === undefined ? (preview ? 3001 : 3000) : Number(env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  return { dataDir, port, preview };
}
module.exports = { runtimeConfig };
