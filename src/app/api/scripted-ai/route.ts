import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isAcceptanceRun, readAiScript, setAiScript } from '@/lib/llm/providers/scripted';

// POST /api/scripted-ai - acceptance runs only: answer every AI request from this script
export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAcceptanceRun()) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json().catch(() => null);
  const script = readAiScript(body);
  if (!script) {
    return NextResponse.json(
      { error: 'turns must be a list of strings; feedback, if given, must be { wentWell: string[], goneBetter: string[] }' },
      { status: 400 }
    );
  }
  setAiScript(script);
  return NextResponse.json(script);
}
