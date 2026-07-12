/**
 * @fileoverview Resolve the Codex CLI session storage directory.
 *
 * Codex CLI records every session as a rollout file under:
 *   ~/.codex/sessions/<YYYY>/<MM>/<DD>/rollout-<timestamp>-<uuid>.jsonl
 *
 * Default home: ~/.codex. Honors $CODEX_HOME and an explicit override
 * (the ledgerLM.codexHome setting, passed in).
 */

const fs = require('fs');
const path = require('path');

/**
 * @param {string} [override] - ledgerLM.codexHome (a .codex home dir), optional.
 * @returns {string|null} absolute path to the sessions dir, or null.
 */
function getCodexSessionsDir(override) {
  const home = override
    || process.env.CODEX_HOME
    || path.join(process.env.USERPROFILE || process.env.HOME || '', '.codex');
  if (!home) return null;
  // Allow the override to point either at the .codex dir or directly at sessions/.
  if (path.basename(home) === 'sessions' && fs.existsSync(home)) return home;
  const sessions = path.join(home, 'sessions');
  return fs.existsSync(sessions) ? sessions : null;
}

module.exports = { getCodexSessionsDir };
