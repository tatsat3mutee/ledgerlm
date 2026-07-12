/**
 * @fileoverview Bundled pricing lookups (Claude Code, Codex CLI). Returns base $/Mtok
 * per model, matched by family substring. Unknown models return null so the caller can
 * flag them.
 */

const table = require('../sources/claudeCode/pricing.json');
const openaiTable = require('../sources/codex/pricing.json');

/**
 * @param {string} modelId e.g. "claude-opus-4-8", "claude-haiku-4-5-20251001"
 * @returns {{input:number, output:number, family:string}|null}
 */
function getClaudePricing(modelId) {
  if (!modelId) return null;
  const id = modelId.toLowerCase();
  const families = table.families;
  // Check most-specific first so "fable" isn't shadowed.
  for (const family of ['fable', 'opus', 'sonnet', 'haiku']) {
    if (id.includes(family) && families[family]) {
      return { ...families[family], family };
    }
  }
  return null;
}

/**
 * @param {string} modelId e.g. "gpt-5.1-codex", "gpt-5-mini", "o4-mini"
 * @returns {{input:number, output:number, cacheRead:number, cacheWrite:number, family:string}|null}
 */
function getOpenAIPricing(modelId) {
  if (!modelId) return null;
  const id = modelId.toLowerCase();
  const families = openaiTable.families;
  // Most-specific first so "gpt-5" doesn't shadow "gpt-5-mini"; "o4-mini" before "o3"
  // is irrelevant but keep mini variants ahead of their bases.
  for (const family of ['gpt-5-mini', 'gpt-5-nano', 'gpt-5', 'codex-mini', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-4o', 'o4-mini', 'o3']) {
    if (id.includes(family) && families[family]) {
      return { ...families[family], family };
    }
  }
  return null;
}

module.exports = { getClaudePricing, getOpenAIPricing };
