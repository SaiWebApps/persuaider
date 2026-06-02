import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/client';

const HTML_PATTERN = /[<>]/;
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 50;

export async function GET() {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { emailVerified: true },
    });
    if (!currentUser || !currentUser.emailVerified) {
      return NextResponse.json(
        { error: 'Email not verified' },
        { status: 403 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { username: true, email: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const totalConversations = await prisma.conversation.count({
      where: { userId: session.user.id },
    });

    const completedConversations = await prisma.conversation.count({
      where: { userId: session.user.id, status: 'completed' },
    });

    const summaries = await prisma.summary.findMany({
      where: {
        conversation: { userId: session.user.id },
      },
      select: { overallScore: true },
    });

    const scores = summaries
      .map((s) => s.overallScore)
      .filter((s): s is number => s !== null);

    const averageScore = scores.length > 0
      ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
      : 0;

    const completionRate = totalConversations > 0
      ? Math.round((completedConversations / totalConversations) * 100)
      : 0;

    return NextResponse.json({
      username: user.username,
      email: user.email,
      stats: {
        totalConversations,
        completedConversations,
        averageScore,
        completionRate,
      },
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json(
      { error: 'Failed to fetch profile' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { emailVerified: true },
    });
    if (!currentUser || !currentUser.emailVerified) {
      return NextResponse.json(
        { error: 'Email not verified' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { username } = body;

    if (!username || typeof username !== 'string') {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    const trimmed = username.trim();

    if (trimmed.length < MIN_USERNAME_LENGTH) {
      return NextResponse.json(
        { error: `Username must be at least ${MIN_USERNAME_LENGTH} characters` },
        { status: 400 }
      );
    }

    if (trimmed.length > MAX_USERNAME_LENGTH) {
      return NextResponse.json(
        { error: `Username must be at most ${MAX_USERNAME_LENGTH} characters` },
        { status: 400 }
      );
    }

    if (HTML_PATTERN.test(trimmed)) {
      return NextResponse.json(
        { error: 'Username contains invalid characters' },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({
      where: { username: trimmed },
      select: { id: true },
    });

    if (existing && existing.id !== session.user.id) {
      return NextResponse.json(
        { error: 'Username already taken' },
        { status: 409 }
      );
    }

    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: { username: trimmed },
      select: { username: true, email: true, role: true },
    });

    return NextResponse.json({
      username: updated.username,
      email: updated.email,
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}
