// Exact public identity only: never infer ownership from email, name or ID digits.
export function hostReportAliases(users, talents) {
  const byPublicId = new Map(users.map(user => [user.publicId, user]));
  return new Map(talents.flatMap(talent => {
    const user = byPublicId.get(talent.publicId);
    return user ? [[talent.id, user]] : [];
  }));
}
