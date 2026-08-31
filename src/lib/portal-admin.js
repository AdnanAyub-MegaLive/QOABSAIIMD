import { auth } from "../../auth";
import { prisma } from "./prisma";

export async function requirePortalAdmin() {
  const session = await auth();
  if (!session?.user?.email) return null;
  return prisma.admin.findFirst({
    where: { email: session.user.email.toLowerCase(), active: true },
    select: { id: true, name: true, email: true, role: true },
  });
}

export async function requireFinanceAdmin() {
  const admin = await requirePortalAdmin();
  return admin && ["ADMIN", "SENIOR_ADMIN", "SUPER_ADMIN"].includes(admin.role)
    ? admin
    : null;
}
