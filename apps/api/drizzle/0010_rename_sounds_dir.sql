-- The TTS / prompt sounds folder moved from sounds/dsip to sounds/munasip
-- (renamed at boot by start-asterisk.sh); keep stored paths pointing at it.
UPDATE "tts_cache" SET "file_path" = replace("file_path", '/sounds/dsip/', '/sounds/munasip/') WHERE "file_path" LIKE '%/sounds/dsip/%';
--> statement-breakpoint
UPDATE "prompts" SET "file_path" = replace("file_path", '/sounds/dsip/', '/sounds/munasip/') WHERE "file_path" LIKE '%/sounds/dsip/%';
