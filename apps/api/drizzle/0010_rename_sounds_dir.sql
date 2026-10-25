-- The TTS / prompt sounds folder moved from sounds/dsip to sounds/monosip
-- (renamed at boot by start-asterisk.sh); keep stored paths pointing at it.
UPDATE "tts_cache" SET "file_path" = replace("file_path", '/sounds/dsip/', '/sounds/monosip/') WHERE "file_path" LIKE '%/sounds/dsip/%';
--> statement-breakpoint
UPDATE "prompts" SET "file_path" = replace("file_path", '/sounds/dsip/', '/sounds/monosip/') WHERE "file_path" LIKE '%/sounds/dsip/%';
