import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register') ||
    pathname.startsWith('/forgot-password') || pathname.startsWith('/reset-password') ||
    pathname.startsWith('/verify-email');
  const isAdminPage = pathname.startsWith('/admin');
  const isProtectedPage = pathname.startsWith('/dashboard') || pathname.startsWith('/persona');

  const token = await getToken({ req: request });
  const isLoggedIn = !!token;

  if (isAdminPage) {
    if (!isLoggedIn) return NextResponse.redirect(new URL('/login', request.url));
    if (token?.role !== 'admin') return NextResponse.redirect(new URL('/dashboard', request.url));
    return NextResponse.next();
  }

  if (isProtectedPage) {
    if (!isLoggedIn) return NextResponse.redirect(new URL('/login', request.url));
    if (token?.emailVerified === false) return NextResponse.redirect(new URL('/verify-email', request.url));
    return NextResponse.next();
  }

  if (isLoggedIn && isAuthPage && !pathname.startsWith('/verify-email')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
