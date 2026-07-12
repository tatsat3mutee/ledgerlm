# Cost methodology

AI coding tools don't bill the same way, so a single "cost" number is misleading unless you know where it comes from. This extension is **token-first**: tokens and cache stats are always exact, and a dollar figure is shown only at the confidence level it deserves.

## Confidence levels

Every session is tagged with a `cost_confidence`, and the dashboard renders cost accordingly:

| Level | Shown as | Meaning |
|---|---|---|
| `billed` | `$X.XX` | Real metered cost. Copilot calls that carry `copilotUsageNanoAiu` (premium-request credits). |
| `partial` | `$X.XX ≥` | A **lower bound** — some calls in the session predate the credit field, so the true cost is at least this. |
| `estimate` | `≈$X.XX est` | A modeled or tool-recorded **API-list-price** figure (Claude Code, Codex, OpenCode). You may actually pay a flat subscription; this is "what the same tokens would cost on the API." Hide it with `ledgerLM.showEstimatedCost: false`. |
| `none` | `—` | No trustworthy cost. Tokens are shown instead. |

> Wrong cost is worse than no cost. We deliberately show `—` rather than a fabricated number.

## How each source is priced

### GitHub Copilot — AI credits
Copilot meters usage in **premium-request credits**, surfaced per call as `copilotUsageNanoAiu` (nano-AI-units). At $0.01 per credit:

```
credits = copilotUsageNanoAiu / 1e9
USD     = copilotUsageNanoAiu / 1e11
```

Calls that carry this field → `billed`. Sessions where only some calls carry it → `partial`. Sessions with none → `none` (we do **not** fall back to the token prices in `models.json`, which are nominal and undercount badly — an earlier version did, and it reported ~37× too low).

### Claude Code — API-equivalent estimate
Claude Code has no per-token bill. We estimate what the same usage *would* cost on the Anthropic API, from a bundled price table in [`src/sources/claudeCode/pricing.json`](../src/sources/claudeCode/pricing.json):

```
cost = fresh_input·input
     + cache_read·(input × 0.1)
     + cache_write·(input × 1.25  [5m]  or  × 2  [1h])
     + output·output            ÷ 1,000,000
```

- `input`/`output` are base $/Mtok per model family (Fable, Opus, Sonnet, Haiku), matched by substring of the model id.
- Cache multipliers follow Anthropic's standard pricing (read 0.1×, 5-minute write 1.25×, 1-hour write 2× — selectable via `ledgerLM.cacheWriteTtl`).
- Unknown models (no family match — e.g. `<synthetic>` entries) contribute tokens but **$0**, and the session/model is flagged `⚠ no price`.

These sessions are tagged `estimate`.

### Codex CLI — API-equivalent estimate
Codex CLI records token counts per call (`token_count` events with `last_token_usage.{input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens}`) but **no cost**, so USD is estimated from a bundled OpenAI price table in [`src/sources/codex/pricing.json`](../src/sources/codex/pricing.json):

```
fresh_input = max(0, input_tokens − cached_input_tokens)   # input includes cached reads
output      = output_tokens                                  # already includes reasoning
cost = fresh_input·input$ + cached·cacheRead$ + output·output$   ÷ 1,000,000
```

- Model families: GPT-5 / GPT-5 mini / GPT-5 nano / codex-mini / GPT-4.1(-mini) / GPT-4o / o3 / o4-mini, matched most-specific-first by substring of the model id (so `gpt-5.1-codex` prices as GPT-5).
- OpenAI uses **implicit prompt caching**: cached reads are billed at ~10% of the input price and there is **no cache-write fee** — cache-write is always 0 for this source (the `cacheWriteTtl` setting does not apply).
- **ChatGPT-plan sign-in**: if you use Codex with a ChatGPT Plus/Pro plan, your real marginal cost is $0 — the estimate is the API-equivalent value of that usage, not a bill.

These sessions are tagged `estimate`.

### OpenCode — cost recorded by the tool
OpenCode computes a per-message `cost` itself (from provider list prices via models.dev) and stores it alongside `tokens.{input, output, reasoning, cache.{read, write}}` in each assistant message. LedgerLM uses that figure **as-is** — no bundled price table needed:

- `tokens.input` is already fresh input (cache reads are recorded separately), so no subtraction is applied.
- Cache reads **and writes** are both recorded — OpenCode is the only estimate-class source with real cache-write token counts.
- Free/subscription providers record `cost: 0`; those calls contribute tokens but no USD.

Because it is a list-price computation rather than a bill, these sessions are tagged `estimate`.

## Updating prices

When Anthropic changes prices, edit the `families` block in [`pricing.json`](../src/sources/claudeCode/pricing.json) (base input/output $/Mtok); for OpenAI (Codex), edit [`src/sources/codex/pricing.json`](../src/sources/codex/pricing.json). Confirm current numbers at <https://platform.claude.com/docs/en/pricing> and <https://platform.openai.com/docs/pricing>. Copilot and OpenCode need no maintenance — Copilot rides on the credit field in your logs and OpenCode records cost itself.

## Caveats

- Credits/USD are only as complete as your logs: older Copilot sessions that predate `copilotUsageNanoAiu` show `—`/`≥`.
- The Claude Code, Codex, and OpenCode figures are API-list-price, not your actual subscription cost; treat them as a relative signal, not a bill.
- Cache-write pricing assumes the configured TTL uniformly; mixed-TTL sessions are approximated. (Claude Code only — Codex has no cache-write fee, and OpenCode records its own cost.)
