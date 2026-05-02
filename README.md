# pilot-state-sync

Automated sync of Bidgely pilot configurations to a searchable repo. A GitHub Actions
cron fetches pilot configs from the Bidgely API, commits changes as structured JSON +
Markdown, and lets Glean index them so anyone can look up any pilot's current config.

**Nothing in this repo is hand-edited.** The `pilots/` directory is machine-generated.
Manual edits to pilot files will be overwritten on the next sync run.

## How it works

1. GitHub Actions runs `scripts/sync.js` on an hourly schedule.
2. Phase 2.5 writes environment-scoped outputs under `pilots/{env}/` and `_meta/{env}/`.
3. The first rollout activates `nonprodqa` only, minting a short-lived API token at
   runtime via `client_credentials` with a Basic auth secret.
4. `uat` and `prod` remain placeholders until their auth details are wired.
5. For each pilot ID, it fetches `/entities/pilot/{id}/configs` from the Bidgely API.
6. Configs are screened for sensitive patterns before writing. Any sensitive-pattern
   hit hard-fails the run; new field types are surfaced as workflow notices.
7. Each pilot gets a `.json` (raw data) and `.md` (Glean-friendly markdown) file.
8. Changes are committed only when data actually changed (diff-only commits).
9. Glean indexes this repo via its GitHub connector. Ask Glean "what is pilot 20018's
   bill projection config?" and get the answer.

## Zero-dependency rule

This repo has **zero npm dependencies**. It uses only Node.js built-in modules:
`node:fs`, `node:crypto`, `node:child_process`, `node:test`. This is a security
decision that eliminates the entire supply-chain-audit problem. Do not add npm
dependencies without explicit team review.

## Setup

1. Create GitHub Actions secrets:
   - `BIDGELY_BASIC_AUTH_NONPRODQA` — prebuilt Base64 payload for
     `Authorization: Basic <secret>` when minting the `nonprodqa` access token
2. Create GitHub Actions variables:
   - `PILOT_CONFIGS_NONPRODQA` — JSON mapping of pilot ID to API base URL
   - `BIDGELY_TOKEN_URL_NONPRODQA` — token endpoint URL
   - `BIDGELY_TOKEN_MODE_NONPRODQA=client_credentials`
   - `BIDGELY_TOKEN_SCOPE_NONPRODQA=all`
   - `LEVELS_OF_INTEREST` — JSON array of entity levels to fetch
   - Optional token-minting knobs:
     `BIDGELY_ACCESS_TOKEN_FIELD_NONPRODQA`,
     `BIDGELY_TOKEN_EXTRA_BODY_NONPRODQA`
3. Run the workflow manually first (Actions > Pilot Config Sync > Run workflow).
4. Eyeball the `nonprodqa` output. `uat` and `prod` should log as placeholders until
   their auth details are added.

## Running tests

```bash
node --test scripts/*.test.js
```

## Operations

See [OPERATIONS.md](OPERATIONS.md) for the runbook: token rotation, adding pilots,
handling unknown fields, sensitive-pattern hits, and recovery procedures.
