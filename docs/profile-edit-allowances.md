# Onboarding and one-time profile corrections

Use authenticated `PATCH /api/v1/users/me` (legacy `/api/users/profile` shares the same rules).

Final onboarding save:
```json
{"country":"PK","dob":"2000-01-01","gender":"MALE","completeOnboarding":true}
```
Country, birthday and gender must be populated to complete onboarding. Country accepts a valid name or ISO-2 code and stores ISO-2. Birthday accepts a real non-future YYYY-MM-DD date. Gender accepts MALE/FEMALE/OTHER and becomes immutable on its first successful selection, even before onboarding completion.

New accounts start with incomplete onboarding, even if registration already supplied country or birthday. Initial selections/corrections before completion do not consume later allowances. Final onboarding save atomically stores the selections and server completion timestamp; subsequent edits consume the corresponding allowance. The app MUST send `completeOnboarding:true` before leaving onboarding. It cannot reset onboarding, clear these fields, or set allowance timestamps. Repeating completion is harmless and never restores an allowance.

After onboarding: send `{country:"DE"}` or `{dob:"2001-02-03"}`. Each field can change exactly once. Same normalized country/date is a successful no-op, even when the allowance is already used. The allowances are independent. Combined edits are all-or-nothing. The existing User row lock covers fresh checks, timestamps, profile writes and audit entry, including avatar history if supplied in the same save.

Authenticated profile GET/PATCH, login, registration, Google login, refresh and session user DTOs include:
```json
{
  "onboardingCompleted":true,
  "onboardingCompletedAt":"2026-10-13T12:00:00.000Z",
  "canChangeCountry":true,
  "countryChangeUsedAt":null,
  "canChangeBirthday":true,
  "birthdayChangeUsedAt":null,
  "canChangeGender":false
}
```
Use permissions from the response, not local counters. HTTP 409 codes: COUNTRY_CHANGE_ALREADY_USED, BIRTHDAY_CHANGE_ALREADY_USED, GENDER_LOCKED. HTTP 422: VALIDATION_ERROR or ONBOARDING_INCOMPLETE. Errors include readable message and fields. Existing session/device checks apply. These private permissions are not added to public profiles.

## Existing-account migration

Historical onboarding/edit history was not recorded, so the migration conservatively marks all existing accounts as onboarding-complete. A populated country/birthday is marked allowance-used at migration time; these timestamps are policy baselines, NOT asserted historical edit times. Missing country/birthday remains eligible for one initial fill after migration (then locked). Gender is locked only if present. No original profile values are changed. Administrators can review legacy exceptions separately; this release does not infer or reset allowances. New records retain nullable defaults and receive the full onboarding + later correction flow.

Deploy the `20261013150000_profile_edit_allowances` migration, regenerate Prisma Client and restart the portal. Mobile integration must be released with the explicit onboarding completion call; an old client that never completes onboarding will continue to see onboarding permissions for new accounts.
