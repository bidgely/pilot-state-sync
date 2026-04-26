# pilot-state-sync

Automated sync of Bidgely pilot configurations to a searchable repo. A GitHub Actions
cron fetches pilot configs from the Bidgely API, commits changes as structured JSON +
Markdown, and lets Glean index them so anyone can look up any pilot's current config.

**Nothing in this repo is hand-edited.** The `pilots/` directory is machine-generated.
Manual edits to pilot files will be overwritten on the next sync run.

## How it works

1. GitHub Actions runs `scripts/sync.js` on an hourly schedule.
2. For each pilot ID, it fetches `/entities/pilot/{id}/configs` from the Bidgely API.
3. Configs are screened for sensitive patterns before writing. Any sensitive-pattern
   hit hard-fails the run; new field types are surfaced as workflow notices.
4. Each pilot gets a `.json` (raw data) and `.md` (Glean-friendly markdown) file.
5. Changes are committed only when data actually changed (diff-only commits).
6. Glean indexes this repo via its GitHub connector. Ask Glean "what is pilot 20018's
   bill projection config?" and get the answer.

## Zero-dependency rule

This repo has **zero npm dependencies**. It uses only Node.js built-in modules:
`node:fs`, `node:crypto`, `node:child_process`, `node:test`. This is a security
decision that eliminates the entire supply-chain-audit problem. Do not add npm
dependencies without explicit team review.

## Setup

1. Create GitHub Actions secrets:
   - `BIDGELY_API_TOKEN` — bearer token for the API
2. Create GitHub Actions variables:
   - `PILOT_CONFIGS` — JSON mapping of pilot ID to API base URL, e.g.
     `{"20018":"https://api-server-nashville-uat.bidgely.com","20019":"https://api-server-other.bidgely.com"}`
   - `BIDGELY_ENV` — environment name, e.g. `uat`
3. Run the workflow manually first (Actions > Pilot Config Sync > Run workflow).
4. Eyeball the output. Only enable the hourly schedule after a clean manual run.

## Running tests

```bash
node --test scripts/*.test.js
```

## Operations

See [OPERATIONS.md](OPERATIONS.md) for the runbook: token rotation, adding pilots,
handling unknown fields, sensitive-pattern hits, and recovery procedures.
