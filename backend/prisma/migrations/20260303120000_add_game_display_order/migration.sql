-- Add persistent display order for games in admin/public catalog
ALTER TABLE "game_types" ADD COLUMN "displayOrder" INTEGER;
