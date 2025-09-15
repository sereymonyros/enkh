
'use server';

/**
 * @fileOverview A flow to handle TikTok OAuth and create a Firebase custom token.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { adminAuth } from '@/lib/firebase';

// TikTok API endpoints
const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const TIKTOK_USERINFO_URL = 'https://open.tiktokapis.com/v2/user/info/';

// Input schema for the flow
const TikTokAuthInputSchema = z.object({
  code: z.string().describe('The authorization code from TikTok redirect.'),
  redirectUri: z.string().describe('The redirect URI used in the initial request.'),
});
export type TikTokAuthInput = z.infer<typeof TikTokAuthInputSchema>;

// Output schema for the flow
const TikTokAuthOutputSchema = z.object({
  customToken: z.string().describe('Firebase custom authentication token.'),
});
export type TikTokAuthOutput = z.infer<typeof TikTokAuthOutputSchema>;


export async function getFirebaseTokenFromTikTokCode(input: TikTokAuthInput): Promise<TikTokAuthOutput> {
  return tiktokAuthFlow(input);
}


const tiktokAuthFlow = ai.defineFlow(
  {
    name: 'tiktokAuthFlow',
    inputSchema: TikTokAuthInputSchema,
    outputSchema: TikTokAuthOutputSchema,
  },
  async ({ code, redirectUri }) => {
    const clientKey = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY;
    const clientSecret = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_SECRET;

    if (!clientKey || !clientSecret) {
      throw new Error('TikTok client key or secret is not configured.');
    }
    if (!adminAuth) {
      throw new Error('Firebase Admin SDK is not initialized.');
    }

    // 1. Exchange authorization code for an access token
    const tokenResponse = await fetch(TIKTOK_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.json();
      console.error('TikTok token exchange failed:', errorBody);
      throw new Error(`Failed to get TikTok access token: ${errorBody.error_description || 'Unknown error'}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    
    // 2. Use the access token to get user info
    const userInfoResponse = await fetch(`${TIKTOK_USERINFO_URL}?fields=open_id,union_id,avatar_url,display_name`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!userInfoResponse.ok) {
      const errorBody = await userInfoResponse.json();
      console.error('TikTok user info fetch failed:', errorBody);
      throw new Error('Failed to fetch user info from TikTok.');
    }

    const userInfoData = await userInfoResponse.json();
    const tiktokUser = userInfoData.data.user;

    const uid = `tiktok:${tiktokUser.open_id}`;
    
    // 3. Create or update the user in Firebase Auth
    try {
      // Check if user exists, if not, create one
      await adminAuth.getUser(uid);
      // If user exists, update their profile info
      await adminAuth.updateUser(uid, {
        displayName: tiktokUser.display_name,
        photoURL: tiktokUser.avatar_url,
      });
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        // User does not exist, create a new one
        await adminAuth.createUser({
          uid: uid,
          displayName: tiktokUser.display_name,
          photoURL: tiktokUser.avatar_url,
        });
      } else {
        // Some other error occurred
        throw error;
      }
    }

    // 4. Create a Firebase custom token for the user
    const customToken = await adminAuth.createCustomToken(uid);

    return { customToken };
  }
);
