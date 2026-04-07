-- Add poolSize to game_level_configs: câte jocuri pre-generate în pool când aiEnabled=false
ALTER TABLE "game_level_configs" ADD COLUMN "poolSize" INTEGER NOT NULL DEFAULT 10;
