
import { getFirebaseTokenFromTikTokCode } from '@/ai/flows/tiktok-auth';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    console.error('TikTok auth error:', error);
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent('TikTok authentication failed.')}`, request.url));
  }

  // TODO: Verify the 'state' parameter against the one you stored in sessionStorage
  // on the client-side to prevent CSRF attacks. This is a crucial security step.
  
  if (!code) {
    return NextResponse.redirect(new URL('/?error=Missing_auth_code', request.url));
  }
  
  const redirectUri = `${request.nextUrl.origin}/auth/tiktok/callback`;

  try {
    const { customToken } = await getFirebaseTokenFromTikTokCode({
      code,
      redirectUri,
    });
    // Redirect back to the home page with the custom token
    return NextResponse.redirect(new URL(`/?token=${customToken}`, request.url));

  } catch (err: any) {
    console.error('Failed to get custom token from TikTok code:', err);
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(err.message || 'An unknown error occurred.')}`, request.url));
  }
}
