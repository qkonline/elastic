-- The session that asked for a handoff code (its hash). It ends when the code is used, so the copy
-- left at the old address keeps nothing that still signs in. Codes from before have none.
ALTER TABLE handoffs ADD COLUMN session TEXT;
