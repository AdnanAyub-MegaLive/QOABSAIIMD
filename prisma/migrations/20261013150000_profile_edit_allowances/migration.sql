ALTER TABLE "User" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3),
  ADD COLUMN "countryChangeUsedAt" TIMESTAMP(3),
  ADD COLUMN "birthdayChangeUsedAt" TIMESTAMP(3);
-- Legacy edit history is unknown: never infer a free extra edit from a stored value.
-- New accounts have NULL defaults and complete onboarding explicitly.
UPDATE "User" SET "onboardingCompletedAt" = CURRENT_TIMESTAMP,
  "countryChangeUsedAt" = CASE WHEN "country" IS NOT NULL THEN CURRENT_TIMESTAMP ELSE NULL END,
  "birthdayChangeUsedAt" = CASE WHEN "dob" IS NOT NULL THEN CURRENT_TIMESTAMP ELSE NULL END;
