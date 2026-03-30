-- AlterTable: add gamesPerLevel to game_level_configs
ALTER TABLE "game_level_configs" ADD COLUMN "gamesPerLevel" INTEGER NOT NULL DEFAULT 3;