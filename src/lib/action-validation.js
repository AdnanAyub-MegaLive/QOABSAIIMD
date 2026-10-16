const messages = {
  HOST_AGENCY_REQUIRED: 'Join an agency before assigning the Host role.',
  USER_NOT_FOUND: 'User not found. Refresh the page and use the current USR/TLN public ID.',
  SPECIAL_ID_NOT_FOUND: 'This Special ID no longer exists. Refresh the list.',
  SPECIAL_ID_IS_DISABLED: 'This Special ID is disabled.',
  SPECIAL_ID_ALREADY_ASSIGNED: 'This Special ID is already assigned.',
  INVALID_SPECIAL_ID_DURATION: 'Enter a valid assignment duration.',
};
export function validationResult(code) {
  return { success: false, error: { code, message: messages[code] ?? code } };
}
export function unwrapAction(result) {
  if (result?.success === false && result.error) {
    throw Object.assign(new Error(result.error.message), { code: result.error.code });
  }
  return result;
}
