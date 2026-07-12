import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import opencode from '../src/sources/opencode/index.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(dir, 'fixtures', 'oc-data');

describe('opencode.discover', () => {
  const found = opencode.discover(dataDir);

  it('finds sessions under the global storage layout', () => {
    expect(found).toHaveLength(1);
    const d = found[0];
    expect(d.sessionId).toBe('oc:ses_abc123');
    expect(d.subFiles).toHaveLength(3);
    expect(d.workspace).toBe('C:/work/webapp');
  });
});

describe('opencode.parse', () => {
  const d = opencode.discover(dataDir)[0];
  const parsed = opencode.parse(d.sourcePath, d.subFiles, d._info);

  it('only counts assistant messages that carry tokens', () => {
    expect(parsed.calls).toHaveLength(2);
  });

  it('reads fresh input, cache read/write, and recorded cost as-is', () => {
    const sonnet = parsed.calls.find((c) => c.model === 'claude-sonnet-4-5');
    expect(sonnet.inputFresh).toBe(1200); // opencode input excludes cache reads
    expect(sonnet.cacheRead).toBe(8000);
    expect(sonnet.cacheWrite).toBe(450);
    expect(sonnet.output).toBe(300);
    expect(sonnet.cost).toBeCloseTo(0.0234);
  });

  it('keeps zero-cost calls (free/subscription providers)', () => {
    const gpt = parsed.calls.find((c) => c.model === 'gpt-5.1');
    expect(gpt.cost).toBe(0);
    expect(gpt.inputFresh).toBe(700);
  });

  it('uses the session info file for title and time bounds', () => {
    expect(parsed.title).toBe('Fix the login redirect bug');
    expect(parsed.firstTs).toBe(1767960000);
    expect(parsed.lastTs).toBe(1767963600);
  });

  it('marks no subagent calls for sessions without a parentID', () => {
    expect(parsed.calls.every((c) => !c.isSubagent)).toBe(true);
  });
});
