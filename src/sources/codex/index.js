/**
 * @fileoverview Codex CLI source: discover rollout session files and parse usage.
 *
 * Layout:
 *   ~/.codex/sessions/<YYYY>/<MM>/<DD>/rollout-<ts>-<uuid>.jsonl
 *
 * Each line: { timestamp: ISO, type, payload }.
 *   - session_meta:  payload { id, timestamp, cwd, originator, cli_version }
 *   - turn_context:  payload { model, cwd, ... }  (model for subsequent calls)
 *   - event_msg:     payload.type === 'user_message'  -> { message } (title)
 *                    payload.type === 'token_count'   -> { info: { last_token_usage:
 *                      { input_tokens, cached_input_tokens, output_tokens,
 *                        reasoning_output_tokens, total_tokens }, ... } }
 *
 * OpenAI semantics: input_tokens INCLUDES cached reads (cached_input_tokens is a
 * subset), so fresh input = input - cached. output_tokens already includes
 * reasoning tokens. Caching is implicit server-side prompt caching: no cache-write
 * tokens and no write fee -> cacheWrite is always 0 for this source.
 * Codex does not record cost, so USD is always estimated from the bundled price table.
 */

const fs = require('fs');
const path = require('path');
const { getCodexSessionsDir } = require('./paths');

const SOURCE = 'codex';
const FILE_RE = /^rollout-.*-([0-9a-fA-F-]{8,})\.jsonl$/;

/**
 * Discover Codex CLI sessions (one rollout file per session), walking the
 * sessions/<YYYY>/<MM>/<DD>/ tree.
 * @param {string} [override] ledgerLM.codexHome
 */
function discover(override) {
  const sessionsDir = getCodexSessionsDir(override);
  if (!sessionsDir) return [];

  const out = [];
  const stack = [{ dir: sessionsDir, depth: 0 }];
  while (stack.length) {
    const { dir, depth } = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (depth < 4) stack.push({ dir: path.join(dir, e.name), depth: depth + 1 });
        continue;
      }
      const m = FILE_RE.exec(e.name);
      if (!m) continue;
      out.push({
        source: SOURCE,
        sessionId: 'cx:' + m[1],
        sourcePath: path.join(dir, e.name),
        subFiles: [],
        workspace: null, // resolved from session_meta.cwd during parse
      });
    }
  }
  return out;
}

/**
 * Parse a Codex rollout file into normalized calls.
 * @param {string} mainPath
 * @returns {{title:string|null, workspace:string|null, calls:Array, models:string[], firstTs:number|null, lastTs:number|null}}
 */
function parse(mainPath) {
  const result = { title: null, workspace: null, calls: [], models: [], firstTs: null, lastTs: null };
  let content;
  try { content = fs.readFileSync(mainPath, 'utf-8'); } catch { return result; }

  const models = new Set();
  let currentModel = null;

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    if (!rec || typeof rec !== 'object') continue;

    const tsSec = rec.timestamp ? Math.floor(Date.parse(rec.timestamp) / 1000) : null;
    const ts = tsSec != null && !Number.isNaN(tsSec) ? tsSec : null;
    if (ts != null) {
      if (result.firstTs == null || ts < result.firstTs) result.firstTs = ts;
      if (result.lastTs == null || ts > result.lastTs) result.lastTs = ts;
    }

    const p = rec.payload;
    if (!p || typeof p !== 'object') continue;

    if (rec.type === 'session_meta') {
      if (p.cwd && !result.workspace) result.workspace = String(p.cwd);
      continue;
    }
    if (rec.type === 'turn_context') {
      if (p.model) { currentModel = String(p.model); }
      continue;
    }
    if (rec.type !== 'event_msg') continue;

    if (p.type === 'user_message' && !result.title) {
      const t = clean(p.message);
      if (t) result.title = t;
      continue;
    }

    if (p.type !== 'token_count') continue;
    const usage = p.info && p.info.last_token_usage;
    if (!usage || typeof usage !== 'object') continue; // rate-limit-only updates carry info: null

    const input = usage.input_tokens || 0;
    const cached = usage.cached_input_tokens || 0;
    const model = currentModel || 'unknown';
    models.add(model);

    result.calls.push({
      ts,
      model,
      inputFresh: Math.max(0, input - cached), // input_tokens includes cached reads
      cacheRead: cached,
      cacheWrite: 0, // implicit caching: no cache-write tokens or fee
      output: usage.output_tokens || 0, // already includes reasoning tokens
      isSubagent: false,
    });
  }

  result.models = [...models];
  return result;
}

function clean(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  if (/^<(environment_context|user_instructions|session_context)/i.test(t)) return null; // injected, not the user
  return t.slice(0, 200);
}

module.exports = { discover, parse, SOURCE };
