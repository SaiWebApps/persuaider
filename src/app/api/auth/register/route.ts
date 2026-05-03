import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db/client';
import { validateRegistration } from '@/lib/validation/auth';
import { sendVerificationEmail } from '@/lib/email/verification';
import * as bcrypt from 'bcryptjs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, username, password, confirmPassword } = body;

    const errors = validateRegistration({ email, username, password, confirmPassword });
    if (errors) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const existingEmail = await prisma.user.findUnique({ where: { email: email.trim() } });
    if (existingEmail) {
      return NextResponse.json({ errors: { email: 'Email already in use' } }, { status: 409 });
    }

    const existingUsername = await prisma.user.findUnique({ where: { username: username.trim() } });
    if (existingUsername) {
      return NextResponse.json({ errors: { username: 'Username already taken' } }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email: email.trim(),
        username: username.trim(),
        passwordHash,
        role: 'user',
        provider: 'credentials',
      },
      select: { id: true, email: true, username: true },
    });

    // Generate email verification token and send verification email
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await prisma.emailVerificationToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    });

    try {
      const verifyUrl = `${process.env.NEXTAUTH_URL}/verify-email?token=${token}`;
      await sendVerificationEmail(user.email, verifyUrl);
    } catch (emailError) {
      // Rollback: delete the token and user if email send fails
      await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
      console.error('Email send failed, rolled back user creation:', emailError);
      return NextResponse.json({ errors: { general: 'Registration failed' } }, { status: 500 });
    }

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ errors: { general: 'Registration failed' } }, { status: 500 });
  }
}
