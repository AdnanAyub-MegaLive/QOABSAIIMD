// Deliberately outside the delegable permission catalogue.
export function isDatabaseOwner(admin, configuredEmail = process.env.ADMIN_EMAIL) {
  const email = String(configuredEmail ?? '').trim().toLowerCase();
  return Boolean(email === 'admin@megachat.live' && admin?.active && admin.role === 'SUPER_ADMIN' &&
    String(admin.email ?? '').trim().toLowerCase() === email);
}
