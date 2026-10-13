import { normalizeSignupCountry } from "./geo-country.js";
import { parseDateOnly, formatDateOnly } from "./date-only.js";

function invalid(code, message, field, status = 422) {
  return Object.assign(new Error(message), { code, status, fields: { [field]: message } });
}
export function profileEditPermissions(user) {
  return {
    onboardingCompleted: Boolean(user.onboardingCompletedAt),
    onboardingCompletedAt: user.onboardingCompletedAt?.toISOString() ?? null,
    countryChangeUsedAt: user.countryChangeUsedAt?.toISOString() ?? null,
    birthdayChangeUsedAt: user.birthdayChangeUsedAt?.toISOString() ?? null,
    canChangeCountry: !user.countryChangeUsedAt,
    canChangeBirthday: !user.birthdayChangeUsedAt,
    canChangeGender: !user.gender,
  };
}
// Must run after acquiring the User row lock, against the fresh persisted row.
export function profileEditChanges(user, input, now = new Date()) {
  const data = {};
  if (Object.hasOwn(input, "completeOnboarding") && input.completeOnboarding !== true)
    throw invalid("VALIDATION_ERROR", "Onboarding can only be marked complete; it cannot be reset.", "completeOnboarding");
  if (Object.hasOwn(input, "country")) {
    const country = typeof input.country === "string" ? normalizeSignupCountry(input.country) : null;
    if (!country) throw invalid("VALIDATION_ERROR", "Select a valid country name or ISO country code.", "country");
    if (country !== (normalizeSignupCountry(user.country) ?? user.country)) {
      if (user.countryChangeUsedAt) throw invalid("COUNTRY_CHANGE_ALREADY_USED", "Your one-time country change has already been used.", "country", 409);
      data.country = country;
      if (user.onboardingCompletedAt) data.countryChangeUsedAt = now;
    }
  }
  if (Object.hasOwn(input, "dob")) {
    const dob = parseDateOnly(input.dob);
    if (!dob || dob > now) throw invalid("VALIDATION_ERROR", "Birthday must be a valid, non-future date in YYYY-MM-DD format.", "dob");
    if (formatDateOnly(dob) !== formatDateOnly(user.dob)) {
      if (user.birthdayChangeUsedAt) throw invalid("BIRTHDAY_CHANGE_ALREADY_USED", "Your one-time birthday change has already been used.", "dob", 409);
      data.dob = dob;
      if (user.onboardingCompletedAt) data.birthdayChangeUsedAt = now;
    }
  }
  if (Object.hasOwn(input, "gender")) {
    const gender = typeof input.gender === "string" ? input.gender.trim().toUpperCase() : null;
    if (!["MALE", "FEMALE", "OTHER"].includes(gender)) throw invalid("VALIDATION_ERROR", "Select MALE, FEMALE or OTHER.", "gender");
    if (user.gender && gender !== user.gender.toUpperCase()) throw invalid("GENDER_LOCKED", "Gender cannot be changed after its first selection.", "gender", 409);
    if (!user.gender) data.gender = gender;
  }
  if (input.completeOnboarding && !user.onboardingCompletedAt) {
    const completed = { ...user, ...data };
    if (!completed.country || !completed.dob || !completed.gender)
      throw invalid("ONBOARDING_INCOMPLETE", "Select country, birthday and gender before completing onboarding.", "completeOnboarding");
    data.onboardingCompletedAt = now;
  }
  return data;
}
