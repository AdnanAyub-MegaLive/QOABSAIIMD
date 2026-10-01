import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "./src/lib/prisma.js";
import { effectiveAdmin, staffDto } from "./src/lib/portal-staff-state.js";
import { isRateLimited } from "./src/lib/rate-limit.js";

function equalsSecret(a, b) {
  const left = Buffer.from(a || ""), right = Buffer.from(b || "");
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  pages: { signIn: "/" },
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) { token.sub = user.id; token.staffVersion = user.sessionVersion; }
      if (!token.sub || !Number.isInteger(token.staffVersion)) return null;
      const admin = await effectiveAdmin(prisma, token.sub);
      if (!admin || admin.sessionVersion !== token.staffVersion) return null;
      token.staff = staffDto(admin);
      return token;
    },
    async session({ session, token }) {
      session.user = { ...session.user, ...token.staff };
      return session;
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { type: "email" },
        password: { type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");

        if (email.length > 254 || password.length > 72 || isRateLimited(`portal-login:${email}`, { limit: 10, windowMs: 60000 })) return null;
        const row = await prisma.admin.findUnique({ where: { email } });
        if (!row?.active) return null;
        const legacy = row.passwordHash === "ENV_AUTH_PENDING_HASH_MIGRATION" && row.role === "SUPER_ADMIN" && email === process.env.ADMIN_EMAIL?.trim().toLowerCase();
        const valid = legacy ? equalsSecret(password, process.env.ADMIN_PASSWORD) : await bcrypt.compare(password, row.passwordHash).catch(() => false);
        if (!valid || !await effectiveAdmin(prisma, row.id)) return null;
        await prisma.admin.update({ where: { id: row.id }, data: { lastLoginAt: new Date(), ...(legacy ? { passwordHash: await bcrypt.hash(password, 12) } : {}) } });
        return { id: row.id, name: row.name, email, sessionVersion: row.sessionVersion };
      },
    }),
  ],
});
