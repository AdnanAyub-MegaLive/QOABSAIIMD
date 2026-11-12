import { hashPassword, verifyPassword } from "./password.js";
import { withConnectionUser } from "./account-connections.js";
import { consumeAuthAttempts } from "./password-login-policy.js";

const fail = (code, message, status = 422, fields) => Object.assign(new Error(message), { code, status, fields });

export async function setUserPassword(db, identity, body) {
  await consumeAuthAttempts(db, [`password:update:${identity.id}`], 5, 3600);
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  if (newPassword.length < 8 || newPassword.length > 128)
    throw fail("VALIDATION_ERROR", "Password data is invalid.", 422, { newPassword: "New password must contain between 8 and 128 characters." });
  return withConnectionUser(db, identity, async (tx, user) => {
    const first = !user.passwordHash;
    if (!first) {
      if (!currentPassword) throw fail("VALIDATION_ERROR", "Password data is invalid.", 422, { currentPassword: "Current password is required." });
      if (currentPassword.length > 1024 || !await verifyPassword(currentPassword, user.passwordHash))
        throw fail("CURRENT_PASSWORD_INCORRECT", "The current password is incorrect.", 401);
      if (await verifyPassword(newPassword, user.passwordHash))
        throw fail("PASSWORD_UNCHANGED", "New password must be different from the current password.");
    }
    const passwordHash = await hashPassword(newPassword), changedAt = new Date();
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    await tx.auditLog.create({ data: {
      action: first ? "PASSWORD_SET" : "USER_PASSWORD_CHANGED", category: "SECURITY",
      entityType: "User", entityId: user.publicId,
      description: `User ${user.publicId} ${first ? "set" : "changed"} their password through the mobile application.`,
      metadata: { source: "MOBILE_APP", sessionPreserved: true, changedAt: changedAt.toISOString() },
    } });
    return { passwordChanged: true, passwordSet: first, hasPassword: true, changedAt: changedAt.toISOString() };
  });
}
