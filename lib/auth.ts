import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";

export const auth = betterAuth({
  appName: "RepairFlow",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    revokeSessionsOnPasswordReset: true,
  },
  user: {
    additionalFields: {
      role: {
        type: ["MANAGER", "TENANT", "CONTRACTOR"],
        required: true,
        defaultValue: "TENANT",
        input: false,
      },
      active: {
        type: "boolean",
        required: true,
        defaultValue: true,
        input: false,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: false },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
    customRules: {
      "/sign-in/email": { window: 60, max: process.env.E2E_MODE === "true" && process.env.NODE_ENV !== "production" ? 100 : 5 },
    },
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    database: { joins: true },
  },
  plugins: [nextCookies()],
});

export type AppRole = "MANAGER" | "TENANT" | "CONTRACTOR";
