-- Add persisted maze params on matches for maze runtime served from DB
ALTER TABLE "matches" ADD COLUMN "mazeSeed" INTEGER;
ALTER TABLE "matches" ADD COLUMN "mazeShape" TEXT;

-- Add per-level AI control flag
ALTER TABLE "game_level_configs" ADD COLUMN "aiEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Maze templates pool
CREATE TABLE "maze_templates" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "level" INTEGER NOT NULL,
  "shapeVariant" TEXT NOT NULL,
  "seed" INTEGER NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "maze_templates_level_shapeVariant_seed_key" ON "maze_templates"("level", "shapeVariant", "seed");
CREATE INDEX "maze_templates_level_isActive_idx" ON "maze_templates"("level", "isActive");

-- Track per-user usage to avoid repeats until pool exhaustion
CREATE TABLE "maze_template_usages" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "level" INTEGER NOT NULL,
  "mazeTemplateId" TEXT NOT NULL,
  "usedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "maze_template_usages_mazeTemplateId_fkey" FOREIGN KEY ("mazeTemplateId") REFERENCES "maze_templates" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "maze_template_usages_userId_level_mazeTemplateId_key" ON "maze_template_usages"("userId", "level", "mazeTemplateId");
CREATE INDEX "maze_template_usages_userId_level_idx" ON "maze_template_usages"("userId", "level");
CREATE INDEX "maze_template_usages_mazeTemplateId_idx" ON "maze_template_usages"("mazeTemplateId");
