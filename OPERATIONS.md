# Operations Runbook

## Rotate the bearer token

1. Get the new token from whoever manages Bidgely API access.
2. Go to repo Settings > Secrets and variables > Actions > Secrets.
3. Update `BIDGELY_API_TOKEN` with the new value.
4. Run the workflow manually (Actions > Pilot Config Sync > Run workflow) to verify.

If the token has already expired, the workflow will have been failing with exit code 2
and the message "ALL pilots failed with auth errors." Fix the secret and re-run.

## Add a new pilot

1. Go to repo Settings > Secrets and variables > Actions > Variables.
2. Edit `PILOT_IDS` to add the new pilot ID (comma-separated).
3. Run the workflow manually to verify.

## Add a new allowed field

When the API returns a field not on the allowlist, the workflow fails with exit code 3
and writes `_meta/unknown_fields.json` listing the new fields.

1. Pull the latest `_meta/unknown_fields.json`.
2. For each new field, decide: is this safe to publish company-wide via Glean?
3. If yes, add the field name to `scripts/allowlist.json` (keep it sorted).
4. If no, leave it off the allowlist. It will be silently dropped.
5. Commit, push, re-run the workflow.

## Handle a sensitive-pattern hit

When the screen catches a value matching a sensitive pattern, the workflow fails with
exit code 4 and writes `_meta/screen_hits.json` with field names (never values).

1. Pull the latest `_meta/screen_hits.json`.
2. For each hit, check the actual value in the API response (NOT in the repo).
3. If it's a false positive (e.g., a URL that looks like base64), no action needed.
   The field stays on the allowlist and the screen will fire every run.
   Consider adding the field to an ignore list in `screen.js` if it's noisy.
4. If it's a real sensitive value, remove the field from `scripts/allowlist.json`.

## Disable the workflow

Go to repo Actions > Pilot Config Sync > ... (kebab menu) > Disable workflow.

Or comment out the `schedule:` trigger in `.github/workflows/sync.yml`.

## Recover from a bad commit

If a bad commit was pushed (e.g., sensitive data slipped through):

1. `git revert <commit-sha>` and push immediately.
2. Consider force-pushing to remove from history if the data is truly sensitive.
3. Rotate any credentials that were exposed.
4. Check if Glean has already indexed the commit (Glean re-indexes periodically).

## Environment variables

| Variable | Type | Description |
|----------|------|-------------|
| `BIDGELY_API_BASE_URL` | Secret | e.g. `https://api-server-nashville-uat.bidgely.com` |
| `BIDGELY_API_TOKEN` | Secret | Bearer token for the API |
| `PILOT_IDS` | Variable | Comma-separated pilot IDs, e.g. `20018,20019,20020` |
| `BIDGELY_ENV` | Variable | Environment name shown in markdown, e.g. `uat` |
