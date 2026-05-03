# ADR-002: canary_percentage lives on the release record, not on a channel config table

**Date:** 2026-05-02
**Status:** Accepted

## Context

The canary percentage (what % of devices receive a new release) could live in two places:

1. **On the release record:** `releases.canary_percentage` — set at upload time, updatable via API.
2. **On a channel config:** A separate `canary_config` table mapping `channel → percentage` — all new releases inherit the channel's configured percentage.

## Decision

Store `canary_percentage` on the `releases` table.

## Rationale

- **Granular control:** A hotfix can be deployed at 100% while an experimental feature ships at 5%, even within the same channel.
- **Backwards compatible:** `DEFAULT 100` means existing releases and tooling require no changes.
- **Simpler schema:** One column addition vs a new table with foreign keys and join logic.
- **Audit trail:** The percentage for each release is recorded in the releases table alongside the commit hash and timestamp. No separate config history needed.

## Consequences

- There is no concept of "this channel always uses 10% canary by default." Each release must explicitly set `--canary-percentage` when a partial rollout is wanted. This is intentional — default is full rollout.
- Sub-project 3 (auto-rollback) will update `canary_percentage` to 0 via the PATCH endpoint when the crash rate threshold is exceeded, which uses the same mechanism built here.
