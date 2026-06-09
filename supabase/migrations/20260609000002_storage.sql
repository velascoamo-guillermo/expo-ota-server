-- Creates the private bucket used by SupabaseStorage (apiUtils/storage/SupabaseStorage.ts).
-- The app authenticates with the service role key, which bypasses RLS,
-- so no storage policies are required.

INSERT INTO storage.buckets (id, name, public)
VALUES ('expo-updates', 'expo-updates', false)
ON CONFLICT (id) DO NOTHING;
