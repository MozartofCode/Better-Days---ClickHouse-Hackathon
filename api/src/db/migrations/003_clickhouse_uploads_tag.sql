-- Lets a user label an upload at upload time (e.g. "August inventory count",
-- "TEFAP intake week 3") so multiple uploads for the same org stay
-- distinguishable in the uploads list instead of just filename + timestamp.
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS tag String DEFAULT '';
