import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import * as bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db/client';

export const authConfig = {
  trustHost: true,
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google' || account?.provider === 'microsoft-entra-id') {
        const email = user.email;
        if (!email) return false;

        const providerName = account.provider === 'microsoft-entra-id' ? 'microsoft' : 'google';

        const existingUser = await prisma.user.findUnique({ where: { email } });

        if (existingUser) {
          if (!existingUser.provider || existingUser.provider === 'credentials') {
            await prisma.user.update({
              where: { email },
              data: {
                provider: providerName,
                providerAccountId: account.providerAccountId,
                emailVerified: existingUser.emailVerified || new Date(),
              },
            });
          } else if (!existingUser.emailVerified) {
            await prisma.user.update({
              where: { email },
              data: { emailVerified: new Date() },
            });
          }
        } else {
          const username = user.name || email.split('@')[0];
          let uniqueUsername = username;
          const existing = await prisma.user.findUnique({ where: { username } });
          if (existing) {
            uniqueUsername = `${username}-${Date.now().toString(36)}`;
          }

          await prisma.user.create({
            data: {
              email,
              username: uniqueUsername,
              provider: providerName,
              providerAccountId: account.providerAccountId,
              role: 'user',
              emailVerified: new Date(),
            },
          });
        }
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        if (account?.provider === 'google' || account?.provider === 'microsoft-entra-id') {
          const dbUser = await prisma.user.findUnique({ where: { email: user.email! } });
          if (dbUser) {
            token.id = dbUser.id;
            token.role = dbUser.role;
            token.emailVerified = true; // OAuth emails are inherently verified
          }
        } else {
          token.id = user.id as string;
          token.role = (user as { role?: string }).role || 'user';
          // For credentials users, check DB for emailVerified status
          const dbUser = await prisma.user.findUnique({ where: { id: user.id as string } });
          token.emailVerified = !!dbUser?.emailVerified;
        }
      }
      return token;
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
        (session.user as { emailVerified?: boolean }).emailVerified = token.emailVerified as boolean;
      }
      return session;
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.passwordHash) {
          return null;
        }

        const passwordsMatch = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!passwordsMatch) {
          return null;
        }

        return {
          id: user.id,
          name: user.username,
          email: user.email,
          role: user.role,
        };
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [Google({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        })]
      : []),
    ...(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET
      ? [MicrosoftEntraID({
          clientId: process.env.MICROSOFT_CLIENT_ID,
          clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
          ...(process.env.MICROSOFT_TENANT_ID
            ? { issuer: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/v2.0` }
            : {}),
        })]
      : []),
  ],
} satisfies NextAuthConfig;
