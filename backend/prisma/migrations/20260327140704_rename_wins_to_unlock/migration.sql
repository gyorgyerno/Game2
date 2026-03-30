-- Rename roundCount -> winsToUnlock and update existing rows to default 5
ALTER TABLE "game_level_configs" RENAME COLUMN "roundCount" TO "winsToUnlock";
UPDATE "game_level_configs" SET "winsToUnlock" = 5 WHERE "winsToUnlock" = 1;
