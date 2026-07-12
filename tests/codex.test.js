import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import codex from '../src/sources/codex/index.js';
import { getOpenAIPricing } from '../src/compute/pricing.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const rollout = path.join(dir, 'fixtures', 'cx-rollout.jsonl');

describe('codex.parse', () => {
  const parsed = codex.parse(rollout);

  it('only counts token_count events that carry usage info', () => {
    expect(parsed.calls).toHaveLength(2);
  });

  it('subtracts cached reads from input (OpenAI input includes cached)', () => {
    const first = parsed.calls[0];
    expect(first.model).toBe('gpt-5.1-codex');
    expect(first.inputFresh).toBe(400); // 1000 - 600
    expect(first.cacheRead).toBe(600);
    expect(first.cacheWrite).toBe(0); // implicit caching: never a write fee
    expect(first.output).toBe(200); // includes reasoning tokens
  });

  it('tracks model switches via turn_context', () => {
    const second = parsed.calls[1];
    expect(second.model).toBe('gpt-5-mini');
    expect(second.inputFresh).toBe(500);
    expect(second.cacheRead).toBe(0);
  });

  it('extracts title, workspace, and time bounds', () => {
    expect(parsed.title).toBe('Refactor the auth module and add tests');
    expect(parsed.workspace).toBe('C:\\work\\api-gateway');
    expect(parsed.firstTs).toBe(Math.floor(Date.parse('2026-01-10T09:00:00.000Z') / 1000));
    expect(parsed.lastTs).toBe(Math.floor(Date.parse('2026-01-10T09:03:00.000Z') / 1000));
    expect(parsed.models.sort()).toEqual(['gpt-5-mini', 'gpt-5.1-codex']);
  });
});

describe('getOpenAIPricing', () => {
  it('matches families by substring, most specific first', () => {
    expect(getOpenAIPricing('gpt-5.1-codex').family).toBe('gpt-5');
    expect(getOpenAIPricing('gpt-5-mini').family).toBe('gpt-5-mini');
    expect(getOpenAIPricing('gpt-5-nano-2026-01').family).toBe('gpt-5-nano');
    expect(getOpenAIPricing('codex-mini-latest').family).toBe('codex-mini');
    expect(getOpenAIPricing('o4-mini').family).toBe('o4-mini');
  });

  it('returns null for unknown models', () => {
    expect(getOpenAIPricing('grok-4')).toBeNull();
    expect(getOpenAIPricing('')).toBeNull();
  });

  it('never charges cache writes (implicit caching)', () => {
    expect(getOpenAIPricing('gpt-5').cacheWrite).toBe(0);
    expect(getOpenAIPricing('gpt-5').cacheRead).toBeCloseTo(0.125);
  });
});
