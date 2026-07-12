/**
 * @fileoverview Resolve the OpenCode data directory and its storage roots.
 *
 * OpenCode stores session data as JSON files under its data directory:
 *   <data>/storage/session/...                     (global layout)
 *   <data>/project/<projectID>/storage/session/... (per-project layout)
 *
 * Default data dir: $XDG_DATA_HOME/opencode or ~/.local/share/opencode (all
 * platforms). Honors an explicit override (the ledgerLM.opencodeHome setting).
 */

const fs = require('fs');
const path = require('path');

/**
 * @param {string} [override] - ledgerLM.opencodeHome (the opencode data dir), optional.
 * @returns {string|null} absolute path to the data dir, or null.
 */
function getOpencodeDataDir(override) {
  const home = override
    || (process.env.XDG_DATA_HOME ? path.join(process.env.XDG_DATA_HOME, 'opencode') : null)
    || path.join(process.env.USERPROFILE || process.env.HOME || '', '.local', 'share', 'opencode');
  if (!home) return null;
  return fs.existsSync(home) ? home : null;
}

/**
 * All storage/ roots under the data dir (global + per-project layouts).
 * @param {string} [override]
 * @returns {string[]}
 */
function getOpencodeStorageRoots(override) {
  const data = getOpencodeDataDir(override);
  if (!data) return [];
  const roots = [];
  const globalStorage = path.join(data, 'storage');
  if (fs.existsSync(path.join(globalStorage, 'session'))) roots.push(globalStorage);
  const projectDir = path.join(data, 'project');
  try {
    for (const e of fs.readdirSync(projectDir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const s = path.join(projectDir, e.name, 'storage');
      if (fs.existsSync(path.join(s, 'session'))) roots.push(s);
    }
  } catch { /* no per-project layout */ }
  return roots;
}

module.exports = { getOpencodeDataDir, getOpencodeStorageRoots };
