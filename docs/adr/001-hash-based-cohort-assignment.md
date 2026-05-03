# ADR-001: Hash-based cohort assignment over DB-stored assignments

**Date:** 2026-05-02
**Status:** Accepted

## Context

To route devices to canary or stable releases, the server must decide which "bucket" a device belongs to. Two approaches were considered:

1. **DB-stored assignments:** When a device first requests an update, assign it a cohort, write the assignment to a `cohorts` table, and look it up on subsequent requests.
2. **Hash-based deterministic:** Compute `hash(device_id + channel) % 100` on every request. No DB write needed.

## Decision

Use hash-based deterministic assignment.

## Rationale

- **No DB write per device:** The cohort is computed in microseconds from data already in the request. Zero additional latency, zero additional storage.
- **Stateless and scalable:** Any server instance computes the same result. No shared cache needed for horizontal scaling.
- **Same pattern as industry tools:** LaunchDarkly, Unleash, and Flipt all use hash-based assignment for the same reason.
- **Stable per device:** `hash(device_id + channel)` always produces the same bucket for the same device+channel pair. The user experience is consistent.

## Consequences

- Changing the hash input format (e.g., adding a salt) would reassign all devices to new buckets — this is a breaking change and must not be done while a canary is active.
- The distribution is not perfectly uniform at small scale (< 100 devices), but is statistically uniform at production scale.
