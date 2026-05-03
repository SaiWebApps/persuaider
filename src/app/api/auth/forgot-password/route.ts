import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db/client';
import { sendPasswordResetEmail } from '@/lib/email';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email: email.trim() } });

    if (user) {
      // Do not create reset token for OAuth-only users (no password to reset)
      if (user.passwordHash === null) {
        // Return 200 to prevent enumeration, but don't send email or create token
      } else {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await prisma.passwordResetToken.create({
          data: {
            token,
            userId: user.id,
            expiresAt,
          },
        });

        const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${token}`;
        await sendPasswordResetEmail(user.email, resetUrl);
      }
    }

    return NextResponse.json({
      message: 'If an account exists with that email, a reset link has been sent.',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json({
      message: 'If an account exists with that email, a reset link has been sent.',
    });
  }
}
