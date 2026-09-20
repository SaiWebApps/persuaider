import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { checkApiRateLimit } from '@/lib/ratelimit';

// Signed-in required. Admin role is enforced by the admin layout and by
// requireAdmin() in API routes, both of which read the database role — the
// single source of truth. The middleware deliberately does not consult Clerk
// metadata, so there is one place a role can come from.
const isProtectedRoute = createRouteMatcher(['/dashboard(.*)', '/persona(.*)', '/admin(.*)']);
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

  if (isProtectedRoute(req)) {
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
