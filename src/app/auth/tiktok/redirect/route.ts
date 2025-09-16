
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const clientKey = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY;
  if (!clientKey) {
    console.error("TikTok client key is not configured.");
    return NextResponse.redirect(new URL('/?error=tiktok_not_configured', request.url));
  }

  // Generate a random string for the state parameter for security (CSRF protection)
  const state = Math.random().toString(36).substring(2);
  const scope = 'user.info.basic';
  
  // Construct the callback URL based on the current request's origin.
  // This makes it work for both localhost and production.
  const redirectUri = `${request.nextUrl.origin}/auth/tiktok/callback`;

  const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize');
  authUrl.searchParams.append('client_key', clientKey);
  authUrl.searchParams.append('scope', scope);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('redirect_uri', redirectUri);
  authUrl.searchParams.append('state', state);

  // Redirect the user to the TikTok authorization page using a server-side response.
  // We also set the state in a cookie to be verified on the callback.
  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set('tiktok_auth_state', state, {
    path: '/',
    httpOnly: true,
    maxAge: 60 * 10, // 10 minutes
  });

  return response;
}
