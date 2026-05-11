import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtectedRoute = createRouteMatcher(['/dashboard(.*)', '/persona(.*)']);
const isAdminRoute = createRouteMatcher(['/admin(.*)']);
const isAuthPage = createRouteMatcher(['/login(.*)', '/register(.*)', '/forgot-password(.*)', '/reset-password(.*)', '/verify-email(.*)']);

export default clerkMiddleware(async (auth, req) => {
  if (isAdminRoute(req)) {
    const { sessionClaims } = await auth.protect();
    if ((sessionClaims?.metadata as { role?: string })?.role !== 'admin') {
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
