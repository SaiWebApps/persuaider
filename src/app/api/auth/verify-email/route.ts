import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: 'Invalid or expired verification link' },
        { status: 400 }
      );
    }

    const verificationToken = await prisma.emailVerificationToken.findUnique({
      where: { token },
    });

    if (!verificationToken || verificationToken.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Invalid or expired verification link' },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { id: verificationToken.userId },
      data: { emailVerified: new Date() },
    });

    await prisma.emailVerificationToken.deleteMany({
      where: { userId: verificationToken.userId },
    });

    return NextResponse.redirect(new URL('/login?verified=true', request.nextUrl.origin));
  } catch (error) {
    console.error('Email verification error:', error);
    return NextResponse.json(
      { error: 'Invalid or expired verification link' },
      { status: 400 }
    );
  }
}
