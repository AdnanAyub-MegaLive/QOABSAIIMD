export const BIO_MAXIMUM_CHARACTERS = 200;

export function normalizeProfileBio(value) {
  if (value === null) return { value: null };
  if (typeof value !== "string") {
    return { error: "Bio must be plain text." };
  }
  const bio = value.replace(/[\r\n\u2028\u2029]+/g, " ").replace(/[ \t]+/g, " ").trim();
  if (!bio) return { value: null };
  if ([...bio].length > BIO_MAXIMUM_CHARACTERS) {
    return { error: "Bio must not exceed 200 characters." };
  }
  // Line breaks and tabs are normalized; other control characters are rejected.
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(bio)) {
    return { error: "Bio must be plain text." };
  }
  return { value: bio };
}
