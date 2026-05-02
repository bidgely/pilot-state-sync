# Operations Runbook

## Rotate environment credentials

Phase 2.5 now runs all environments with a mixed auth model:
- `uat` uses a stable bearer token
- `nonprodqa` uses one `client_credentials` Basic auth secret
- `prod` uses three region-specific `client_credentials` Basic auth secrets

1. Get the new environment credential from whoever manages Bidgely API access.
2. Go to repo Settings > Secrets and variables > Actions > Secrets.
3. Update the appropriate secret:
   - `BIDGELY_API_TOKEN_UAT`
   - `BIDGELY_BASIC_AUTH_NONPRODQA`
   - `BIDGELY_BASIC_AUTH_PROD_EU`
   - `BIDGELY_BASIC_AUTH_PROD_NA`
   - `BIDGELY_BASIC_AUTH_PROD_NA2`
4. If a token endpoint contract changed, also update the matching `BIDGELY_TOKEN_URL_*`,
   `BIDGELY_TOKEN_MODE_*`, `BIDGELY_TOKEN_SCOPE_*`, and any optional response/body
   overrides for that environment or prod region.
5. Run the workflow manually (Actions > Pilot Config Sync > Run workflow) to verify.

If the token has already expired, the workflow will have been failing with exit code 2
and the message "ALL pilots failed with auth errors." Fix the secret and re-run.

## Add a new pilot

1. Go to repo Settings > Secrets and variables > Actions > Variables.
2. Edit the appropriate `PILOT_CONFIGS_*` variable to add the new pilot ID
   and its API base URL.
   e.g. add `"20020":"https://api-server-foo.bidgely.com"` to the JSON object.
3. Run the workflow manually to verify.

## New field types appear

There is no allowlist. Every field returned by the API is synced. New field types
are surfaced as GitHub Actions notices on the run page (yellow banner) and logged
as `::notice::` lines, but they do not fail the build.

If a new field type warrants attention (e.g., a config you didn't expect), inspect
the committed JSON in `pilots/{env}/{pilotId}.json` directly.

## Handle a sensitive-pattern hit

When the screen catches a value matching a sensitive pattern, the workflow fails with
exit code 4 and writes `_meta/{env}/screen_hits.json` with field names (never values).

1. Pull the latest `_meta/{env}/screen_hits.json`.
2. For each hit, check the actual value in the API response (NOT in the repo).
3. If it's a false positive (e.g., a URL that looks like base64), update the
   sensitive-pattern regexes in `scripts/screen.js` to be more specific.
4. If it's a real sensitive value, the field needs to be redacted at the API source
   before this sync can be re-enabled.

## Disable the workflow

Go to repo Actions > Pilot Config Sync > ... (kebab menu) > Disable workflow.

Or comment out the `schedule:` trigger in `.github/workflows/sync.yml`.

## Recover from a bad commit

If a bad commit was pushed (e.g., sensitive data slipped through):

1. `git revert <commit-sha>` and push immediately.
2. Consider force-pushing to remove from history if the data is truly sensitive.
3. Rotate any credentials that were exposed.
4. Check if Glean has already indexed the commit (Glean re-indexes periodically).

## Entity-level overrides (LEVELS_OF_INTEREST)

Some pilot configs are scoped narrower than pilot-root, e.g.
`20018.MONTHLY_SUMMARY.ELECTRIC` overrides `20018.MONTHLY_SUMMARY` overrides
`20018`. The runtime resolver picks the deepest level that is set. If the snapshot
only covers pilot-root, you cannot see what the resolver will actually return.

`LEVELS_OF_INTEREST` lists entity-ID suffixes (relative to the pilot ID) that the
sync should fetch per pilot. For each entry, the cron calls
`/entities/pilot/{pilotId}.{level}/configs`. 404 means "this level isn't configured
for this pilot" and is skipped silently. Successes are written to
`pilots/{env}/{pilotId}.levels/{level}.json` and rendered as
`## Entity-Level Overrides — {level}` sections in `pilots/{env}/{pilotId}.md`
(Glean-indexable).

To add or remove a level: edit `LEVELS_OF_INTEREST` in repo Settings > Variables
and re-run the workflow. Empty/unset = root only (legacy behavior).

Phase 2.5 uses env-scoped storage for all environments. `prod` is split into three
region-specific workflow steps that all write into the shared `prod` tree using
disjoint pilot subsets. `_meta/prod/last_run.json` is merged across those steps so
the final env summary reflects all prod pilots from the full workflow run.

Example value (committed v1 set, 39 entries):

```json
[
  "USER_WELCOME","USER_WELCOME.ELECTRIC","USER_WELCOME.GAS",
  "AO_SAVINGS","AO_SAVINGS.ELECTRIC","AO_SAVINGS.GAS",
  "MONTHLY_SUMMARY","MONTHLY_SUMMARY.ELECTRIC","MONTHLY_SUMMARY.GAS",
  "NEIGHBOURHOOD_COMPARISON","NEIGHBOURHOOD_COMPARISON.ELECTRIC","NEIGHBOURHOOD_COMPARISON.GAS",
  "BILL_PROJECTION","BILL_PROJECTION.ELECTRIC","BILL_PROJECTION.GAS",
  "USAGE_ALERT","USAGE_ALERT.ELECTRIC","USAGE_ALERT.GAS",
  "SEASONAL_ALERT","SEASONAL_ALERT.ELECTRIC","SEASONAL_ALERT.GAS",
  "PERSONALIZED_SEASONAL_ALERT","PERSONALIZED_SEASONAL_ALERT.ELECTRIC","PERSONALIZED_SEASONAL_ALERT.GAS",
  "NBI","NBI.ELECTRIC","NBI.GAS",
  "BUDGET_ALERT","BUDGET_ALERT.ELECTRIC","BUDGET_ALERT.GAS",
  "WEEKLY_TRACKER","WEEKLY_TRACKER.ELECTRIC","WEEKLY_TRACKER.GAS",
  "HER","HER.ELECTRIC","HER.GAS",
  "WEB_DASHBOARD","WEB_DASHBOARD.ELECTRIC","WEB_DASHBOARD.GAS"
]
```

For Phase 2 (single-level MVP), start with one entry like
`["MONTHLY_SUMMARY.ELECTRIC"]` to validate API behavior, then expand.

## Environment variables

| Variable | Type | Description |
|----------|------|-------------|
| `BIDGELY_API_TOKEN_UAT` | Secret | Stable bearer token for `uat` |
| `BIDGELY_BASIC_AUTH_NONPRODQA` | Secret | Base64 payload for `Authorization: Basic <secret>` when minting the `nonprodqa` access token |
| `BIDGELY_BASIC_AUTH_PROD_EU` / `..._PROD_NA` / `..._PROD_NA2` | Secret | Region-specific Base64 Basic auth payloads for prod token minting |
| `PILOT_CONFIGS_UAT` | Variable | JSON mapping of pilot ID → API base URL for `uat` |
| `PILOT_CONFIGS_NONPRODQA` | Variable | JSON mapping of pilot ID → API base URL for `nonprodqa` |
| `PILOT_CONFIGS_PROD_EU` / `..._PROD_NA` / `..._PROD_NA2` | Variable | Region-specific prod pilot maps |
| `BIDGELY_TOKEN_URL_NONPRODQA` | Variable | Token endpoint URL for `nonprodqa` |
| `BIDGELY_TOKEN_URL_PROD_EU` / `..._PROD_NA` / `..._PROD_NA2` | Variable | Region-specific prod token endpoints |
| `BIDGELY_TOKEN_MODE_NONPRODQA` | Variable | Token mint mode for `nonprodqa`. Set to `client_credentials`. |
| `BIDGELY_TOKEN_MODE_PROD_EU` / `..._PROD_NA` / `..._PROD_NA2` | Variable | Token mint modes for prod regions. Set to `client_credentials`. |
| `BIDGELY_TOKEN_SCOPE_NONPRODQA` | Variable | Optional token scope for `nonprodqa`. Set to `all` for the current endpoint. |
| `BIDGELY_TOKEN_SCOPE_PROD_EU` / `..._PROD_NA` / `..._PROD_NA2` | Variable | Optional token scopes for prod regions. Set to `all` for the current endpoints. |
| `LEVELS_OF_INTEREST` | Variable | (Optional) JSON array of entity-ID suffixes to fetch per pilot in addition to pilot-root. See "Entity-level overrides" above. Default `[]` (root only). |
| `BIDGELY_ACCESS_TOKEN_FIELD_NONPRODQA` / `..._PROD_EU` / `..._PROD_NA` / `..._PROD_NA2` | Variable | (Optional) Dot-path to the access token in the response JSON. Default `access_token`. |
| `BIDGELY_TOKEN_EXTRA_BODY_NONPRODQA` / `..._PROD_EU` / `..._PROD_NA` / `..._PROD_NA2` | Variable | (Optional) Extra JSON object merged into the minted-token request body. |
