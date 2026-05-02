# pilot-state-sync

Automated sync of Bidgely pilot configurations to a searchable repo. A GitHub Actions
cron fetches pilot configs from the Bidgely API, commits changes as structured JSON +
Markdown, and lets Glean index them so anyone can look up any pilot's current config.

**Nothing in this repo is hand-edited.** The `pilots/` directory is machine-generated.
Manual edits to pilot files will be overwritten on the next sync run.

## How it works

1. GitHub Actions runs `scripts/sync.js` on an hourly schedule.
2. Phase 2.5 writes environment-scoped outputs under `pilots/{env}/` and `_meta/{env}/`.
3. `uat` uses the stable static bearer token flow.
4. `nonprodqa` mints a short-lived API token at runtime via `client_credentials`
   with a Basic auth secret.
5. `prod` runs as three region-specific minted-token steps that all write into the
   shared `pilots/prod/` and `_meta/prod/` trees.
6. The `prod` steps merge into one `_meta/prod/last_run.json` summary so the env-level
   metadata reflects all prod pilot subsets, not just the last region step.
7. For each pilot ID, it fetches `/entities/pilot/{id}/configs` from the Bidgely API.
8. Configs are screened for sensitive patterns before writing. Any sensitive-pattern
   hit hard-fails the run; new field types are surfaced as workflow notices.
9. Each pilot gets a `.json` (raw data) and `.md` (Glean-friendly markdown) file.
10. Changes are committed only when data actually changed (diff-only commits).
11. Glean indexes this repo via its GitHub connector. Ask Glean "what is pilot 20018's
   bill projection config?" and get the answer.

## Zero-dependency rule

This repo has **zero npm dependencies**. It uses only Node.js built-in modules:
`node:fs`, `node:crypto`, `node:child_process`, `node:test`. This is a security
decision that eliminates the entire supply-chain-audit problem. Do not add npm
dependencies without explicit team review.

## Setup

1. Create GitHub Actions secrets:
   - `BIDGELY_API_TOKEN_UAT` — stable bearer token for `uat`
   - `BIDGELY_BASIC_AUTH_NONPRODQA` — prebuilt Base64 payload for
     `Authorization: Basic <secret>` when minting the `nonprodqa` access token
   - `BIDGELY_BASIC_AUTH_PROD_EU` — Basic auth payload for prod EU token minting
   - `BIDGELY_BASIC_AUTH_PROD_NA` — Basic auth payload for prod NA token minting
   - `BIDGELY_BASIC_AUTH_PROD_NA2` — Basic auth payload for prod NA2 token minting
2. Create GitHub Actions variables:
   - `PILOT_CONFIGS_UAT` — JSON mapping of pilot ID to API base URL for `uat`
   - `PILOT_CONFIGS_NONPRODQA` — JSON mapping of pilot ID to API base URL
   - `PILOT_CONFIGS_PROD_EU` — e.g. `{"20018":"https://api.eu.bidgely.com"}`
   - `PILOT_CONFIGS_PROD_NA` — e.g. `{"10136":"https://naapi.bidgely.com"}`
   - `PILOT_CONFIGS_PROD_NA2` — e.g.
     `{"10129":"http://naapi2-external.bidgely.com","10128":"http://naapi2-external.bidgely.com"}`
   - `BIDGELY_TOKEN_URL_NONPRODQA` — token endpoint URL
   - `BIDGELY_TOKEN_URL_PROD_EU`, `BIDGELY_TOKEN_URL_PROD_NA`,
     `BIDGELY_TOKEN_URL_PROD_NA2`
   - `BIDGELY_TOKEN_MODE_NONPRODQA=client_credentials`
   - `BIDGELY_TOKEN_MODE_PROD_EU=client_credentials`
   - `BIDGELY_TOKEN_MODE_PROD_NA=client_credentials`
   - `BIDGELY_TOKEN_MODE_PROD_NA2=client_credentials`
   - `BIDGELY_TOKEN_SCOPE_NONPRODQA=all`
   - `BIDGELY_TOKEN_SCOPE_PROD_EU=all`
   - `BIDGELY_TOKEN_SCOPE_PROD_NA=all`
   - `BIDGELY_TOKEN_SCOPE_PROD_NA2=all`
   - `LEVELS_OF_INTEREST` — JSON array of entity levels to fetch
   - Optional token-minting knobs:
     `BIDGELY_ACCESS_TOKEN_FIELD_NONPRODQA`,
     `BIDGELY_TOKEN_EXTRA_BODY_NONPRODQA`,
     `BIDGELY_ACCESS_TOKEN_FIELD_PROD_EU`,
     `BIDGELY_ACCESS_TOKEN_FIELD_PROD_NA`,
     `BIDGELY_ACCESS_TOKEN_FIELD_PROD_NA2`,
     `BIDGELY_TOKEN_EXTRA_BODY_PROD_EU`,
     `BIDGELY_TOKEN_EXTRA_BODY_PROD_NA`,
     `BIDGELY_TOKEN_EXTRA_BODY_PROD_NA2`
3. Run the workflow manually first (Actions > Pilot Config Sync > Run workflow).
4. Eyeball the `uat`, `nonprodqa`, and all three `prod` region outputs. The final
   repo tree should contain `pilots/uat/`, `pilots/nonprodqa/`, and `pilots/prod/`.

## Running tests

```bash
node --test scripts/*.test.js
```

## Operations

See [OPERATIONS.md](OPERATIONS.md) for the runbook: token rotation, adding pilots,
handling unknown fields, sensitive-pattern hits, and recovery procedures.
