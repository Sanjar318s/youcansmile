/** Block direct HTTP access to server-side source folders. */
export default function middleware(request) {
  const path = new URL(request.url).pathname;
  if (path.startsWith('/lib/') || path.startsWith('/server/') || path.startsWith('/scripts/')) {
    return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  }
}

export const config = {
  matcher: ['/lib/:path*', '/server/:path*', '/scripts/:path*'],
};
