-- scripts/migrations/001_add_canary_percentage.sql
-- Adds canary_percentage to releases table.
-- DEFAULT 100 means all existing records behave as full rollout.
ALTER TABLE releases
  ADD COLUMN canary_percentage INTEGER NOT NULL DEFAULT 100;
