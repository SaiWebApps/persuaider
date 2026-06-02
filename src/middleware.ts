import { clerkMiddleware, createRouteMatcher, clerkClient } from '@clerk/nextjs/server';
import { checkApiRateLimit } from '@/lib/ratelimit';

const isProtectedRoute = createRouteMatcher(['/dashboard(.*)', '/persona(.*)']);
const isAdminRoute = createRouteMatcher(['/admin(.*)']);
const isAuthPage = createRouteMatcher(['/login(.*)', '/register(.*)', '/forgot-password(.*)', '/reset-password(.*)', '/verify-email(.*)']);

export default clerkMiddleware(async (auth, req) => {
  // Rate limit API routes (except webhooks — they're inbound from external services)
  if (req.nextUrl.pathname.startsWith('/api/') && !req.nextUrl.pathname.startsWith('/api/webhooks/')) {
    const { userId } = await auth();
    if (userId) {
      const rateLimitResult = await checkApiRateLimit(userId);
      if (rateLimitResult && !rateLimitResult.success) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
        });
      }
    }
  }

  if (isAdminRoute(req)) {
    const { userId, sessionClaims } = await auth.protect();
    let role = (sessionClaims?.metadata as { role?: string })?.role;
    // The Clerk session token doesn't include public_metadata by default, so the
    // role claim may be absent. Fall back to the Backend API to resolve the role.
    if (role !== 'admin' && userId) {
      try {
        const client = await clerkClient();
        const user = await client.users.getUser(userId);
        role = (user.publicMetadata as { role?: string })?.role;
      } catch {
        role = undefined;
      }
    }
    if (role !== 'admin') {
      return Response.redirect(new URL('/dashboard', req.url));
    }
  } else if (isProtectedRoute(req)) {
    await auth.protect();
  } else if (isAuthPage(req)) {
    const { userId } = await auth();
    if (userId) {
      return Response.redirect(new URL('/dashboard', req.url));
    }
  }
});

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)', '/(api|trpc)(.*)'],
};
