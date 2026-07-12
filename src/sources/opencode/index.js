/**
 * @fileoverview OpenCode source: discover session storage and parse usage.
 *
 * Layout (per storage root, global or per-project):
 *   storage/session/info/<sessionID>.json          { id, title, time:{created,updated},
 *                                                    directory?, parentID?, version }
 *   storage/session/message/<sessionID>/<msgID>.json
 *     assistant messages: { role:'assistant', time:{created,completed}, modelID,
 *       providerID, cost, tokens: { input, output, reasoning, cache: { read, write } } }
 *
 * OpenCode records tokens.input as FRESH input (cache reads are separate) and
 * records a per-message cost in USD, computed by OpenCode itself from provider
 * list prices. We surface that cost as an estimate (it is list price, not a bill).
 * Sessions with a parentID are subagent (task) sessions; their calls are flagged.
 */

const fs = require('fs');
const path = require('path');
const { getOpencodeStorageRoots } = require('./paths');

const SOURCE = 'opencode';

/**
 * Discover OpenCode sessions across all storage roots. The descriptor's
 * sourcePath is the session's message directory; subFiles lists the message
 * JSON files inside it (so the sync engine's change signature covers them).
 * @param {string} [override] ledgerLM.opencodeHome
 */
function discover(override) {
  const out = [];
  for (const root of getOpencodeStorageRoots(override)) {
    const msgRoot = path.join(root, 'session', 'message');
    let sessionDirs;
    try { sessionDirs = fs.readdirSync(msgRoot, { withFileTypes: true }); } catch { continue; }

    for (const s of sessionDirs) {
      if (!s.isDirectory()) continue;
      const msgDir = path.join(msgRoot, s.name);
      let msgFiles = [];
      try {
        msgFiles = fs.readdirSync(msgDir).filter((f) => f.endsWith('.json')).map((f) => path.join(msgDir, f));
      } catch { continue; }
      if (!msgFiles.length) continue;

      const info = readInfo(root, s.name);
      out.push({
        source: SOURCE,
        sessionId: 'oc:' + s.name,
        sourcePath: msgDir,
        subFiles: msgFiles,
        workspace: info.workspace,
        _info: info,
      });
    }
  }
  return out;
}

/** Read session metadata (title, times, workspace, parentID) if the info file exists. */
function readInfo(storageRoot, sessionId) {
  const empty = { title: null, workspace: null, parentID: null, created: null, updated: null };
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(storageRoot, 'session', 'info', `${sessionId}.json`), 'utf-8'));
    return {
      title: doc.title ? String(doc.title).slice(0, 200) : null,
      workspace: doc.directory || null,
      parentID: doc.parentID || null,
      created: msToSec(doc.time && doc.time.created),
      updated: msToSec(doc.time && doc.time.updated),
    };
  } catch {
    return empty;
  }
}

function msToSec(ms) {
  if (typeof ms !== 'number' || !isFinite(ms)) return null;
  return Math.floor(ms > 1e12 ? ms / 1000 : ms); // tolerate seconds already
}

/**
 * Parse an OpenCode session (its message directory) into normalized calls.
 * @param {string} msgDir the session's message directory
 * @param {string[]} [msgFiles] message JSON paths (from discover)
 * @param {{title?:string|null, parentID?:string|null, created?:number|null, updated?:number|null}} [info]
 * @returns {{title:string|null, workspace:string|null, calls:Array, models:string[], firstTs:number|null, lastTs:number|null}}
 */
function parse(msgDir, msgFiles = [], info = {}) {
  const result = { title: info.title || null, workspace: null, calls: [], models: [], firstTs: info.created ?? null, lastTs: info.updated ?? null };
  const models = new Set();
  const isSubagent = !!info.parentID;

  let files = msgFiles;
  if (!files.length) {
    try { files = fs.readdirSync(msgDir).filter((f) => f.endsWith('.json')).map((f) => path.join(msgDir, f)); } catch { return result; }
  }

  for (const file of files) {
    let msg;
    try { msg = JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { continue; }
    if (!msg || typeof msg !== 'object') continue;

    const ts = msToSec(msg.time && (msg.time.completed || msg.time.created));
    if (ts != null) {
      if (result.firstTs == null || ts < result.firstTs) result.firstTs = ts;
      if (result.lastTs == null || ts > result.lastTs) result.lastTs = ts;
    }

    if (msg.role !== 'assistant' || !msg.tokens) continue;
    const tk = msg.tokens;
    const cache = tk.cache || {};
    const model = msg.modelID || 'unknown';
    models.add(model);

    result.calls.push({
      ts,
      model,
      inputFresh: tk.input || 0, // opencode's input excludes cache reads
      cacheRead: cache.read || 0,
      cacheWrite: cache.write || 0,
      output: tk.output || 0, // reasoning tokens are already included by providers that bill them
      cost: msg.cost || 0, // recorded by OpenCode (provider list price)
      isSubagent,
    });
  }

  result.models = [...models];
  return result;
}

module.exports = { discover, parse, SOURCE };
