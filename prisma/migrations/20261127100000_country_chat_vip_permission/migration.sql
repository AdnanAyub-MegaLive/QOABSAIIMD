-- Preserve existing privileges and enable messaging for existing eligible tiers once.
UPDATE "VipTier" SET "privileges" = array_append("privileges", 'COUNTRY_CHAT')
WHERE "level" >= 3 AND NOT ('COUNTRY_CHAT' = ANY("privileges"));
