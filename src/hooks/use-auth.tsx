
'use client';

import {
  useState,
  useEffect,
  createContext,
  useContext,
  ReactNode,
  useCallback,
} from 'react';
import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  User,
  GoogleAuthProvider,
  FacebookAuthProvider,
  getRedirectResult,
  signInWithRedirect,
  signInWithPopup,
  OAuthProvider,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { toast } from 'sonner';
import { getHistory } from '@/ai/flows/get-history';
import { mergeFirestoreHistory } from '@/lib/db';

export type AuthState =
  | { state: 'loading' }
  | { state: 'unauthenticated' }
  | { state: 'authenticated'; user: User };

// Define the shape of the authentication context
interface AuthContextType {
  user: User | null;
  authState: AuthState;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithFacebook: () => Promise<void>;
}

// Create the context with a default undefined value
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Define the props for the AuthProvider component
interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [authState, setAuthState] = useState<AuthState>({ state: 'loading' });

  const syncHistory = useCallback(async (uid: string) => {
    if (!navigator.onLine) {
      console.log("Offline: Skipping history sync.");
      return;
    }
    try {
      console.log('Starting history sync...');
      const firestoreHistory = await getHistory({ userId: uid });
      if (firestoreHistory) {
        await mergeFirestoreHistory(uid, firestoreHistory);
        console.log('History sync completed successfully.');
      }
    } catch (error) {
      console.error("History sync failed:", error);
    }
  }, []);

  useEffect(() => {
    // This is the single source of truth for auth state.
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setAuthState({ state: 'authenticated', user });
        // Don't sync here immediately, let the redirect handler do it
        // to avoid race conditions.
      } else {
        setAuthState({ state: 'unauthenticated' });
      }
    });

    // Handle any redirect results on startup.
    getRedirectResult(auth)
      .then(async (result) => {
        if (result) {
          // User just signed in via redirect.
          const user = result.user;
          setAuthState({ state: 'authenticated', user });
          toast.success(`Welcome, ${user.displayName}!`);
          // Explicitly trigger sync after a redirect login.
          await syncHistory(user.uid);
        } else {
          // This block runs on normal page loads. If there's already a user
          // session, onAuthStateChanged will handle it.
          if (auth.currentUser) {
            setAuthState({ state: 'authenticated', user: auth.currentUser });
            await syncHistory(auth.currentUser.uid);
          }
        }
      })
      .catch((error) => {
        console.error("Error processing redirect result:", error);
        if (error.code === 'auth/account-exists-with-different-credential') {
          toast.error("Sign-In Failed", {
            description: 'An account already exists with this email. Please sign in with the original method.'
          });
        } else {
          toast.error("Sign-In Error", {
            description: "There was a problem during the sign-in process."
          })
        }
      });

    return () => unsubscribe();
  }, [syncHistory]);


  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      setAuthState({ state: 'unauthenticated' });
      toast.success('You have been signed out.');
    } catch (error) {
      console.error('Sign-out failed:', error);
      toast.error('Failed to sign out. Please try again.');
    }
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithRedirect(auth, provider);
    } catch (error: any) {
      console.error("Google Sign-in error:", error);
      toast.error("Sign-In Failed", {
        description: error.message || "Could not start the sign-in process."
      });
    }
  };

  const signInWithFacebook = async () => {
    const provider = new FacebookAuthProvider();
    try {
      // Use signInWithPopup for Facebook to avoid iframe issues in dev env.
      const result = await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') {
        toast.info("Sign-in cancelled", {
          description: "The sign-in window was closed before completion."
        });
      } else if (error.code === 'auth/account-exists-with-different-credential') {
        toast.error("Sign-In Failed", {
          description: 'An account already exists with this email. Please sign in with the original method.'
        });
      } else {
        console.error("Facebook Sign-in error:", error);
        toast.error("Sign-In Failed", {
          description: error.message || "Could not complete the sign-in process."
        });
      }
    }
  };

  const value = {
    user: authState.state === 'authenticated' ? authState.user : null,
    authState,
    signOut,
    signInWithGoogle,
    signInWithFacebook,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use the auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
