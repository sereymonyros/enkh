
import { getFirebaseTokenFromTikTokCode } from '@/ai/flows/tiktok-auth';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const stateFromTikTok = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    console.error('TikTok auth error:', error);
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent('TikTok authentication failed.')}`, request.url));
  }

  const stateFromCookie = request.cookies.get('tiktok_auth_state')?.value;
  if (!stateFromCookie || stateFromTikTok !== stateFromCookie) {
    console.error('TikTok auth state mismatch. Potential CSRF attack.');
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent('Invalid state. Please try again.')}`, request.url));
  }
  
  if (!code) {
    return NextResponse.redirect(new URL('/?error=Missing_auth_code', request.url));
  }
  
  const redirectUri = `${request.nextUrl.origin}/auth/tiktok/callback`;

  try {
    const { customToken } = await getFirebaseTokenFromTikTokCode({
      code,
      redirectUri,
    });

    // Clear the state cookie after use
    const response = NextResponse.redirect(new URL(`/?token=${customToken}`, request.url));
    response.cookies.delete('tiktok_auth_state');
    
    return response;

  } catch (err: any) {
    console.error('Failed to get custom token from TikTok code:', err);
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(err.message || 'An unknown error occurred.')}`, request.url));
  }
}
