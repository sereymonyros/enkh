
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
  signInAnonymously,
  signOut as firebaseSignOut,
  User,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { toast } from 'sonner';
import { getHistory } from '@/ai/flows/get-history';
import { mergeFirestoreHistory } from '@/lib/db';

export type AuthState =
  | { state: 'loading' }
  | { state: 'authenticated'; user: User };

// Define the shape of the authentication context
interface AuthContextType {
  user: User | null;
  authState: AuthState;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
}

// Create the context with a default undefined value
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Define the props for the AuthProvider component
interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [authState, setAuthState] = useState<AuthState>({ state: 'loading' });

  const syncHistory = useCallback(async (uid: string) => {
    try {
      console.log('Starting history sync...');
      const firestoreHistory = await getHistory({ userId: uid });
      await mergeFirestoreHistory(uid, firestoreHistory);
      console.log('History sync completed successfully.');
    } catch (error) {
      console.error("History sync failed:", error);
    }
  }, []);

  useEffect(() => {
    // This effect handles the entire auth lifecycle, including redirect results.
    // It's structured to prevent race conditions on mobile.

    // 1. Check for a redirect result from Google Sign-In first.
    getRedirectResult(auth)
      .then((result) => {
        if (result) {
          // If there's a result, the user has just signed in.
          // `onAuthStateChanged` will soon fire with this new user,
          // so we don't need to do anything else here.
          toast.success(`Welcome, ${result.user.displayName}!`);
        }
      })
      .catch((error) => {
        // This catches errors from the redirect process itself.
        console.error("Google redirect sign-in error:", error);
        toast.error("Sign-in failed", { description: "Could not complete sign-in with Google." });
      })
      .finally(() => {
        // 2. AFTER checking for redirect, set up the main auth state listener.
        // This is crucial. It ensures we don't prematurely create an anonymous user
        // before the redirect result is processed.
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                // If a user (Google or anonymous) is found, set the state.
                setUser(currentUser);
                setAuthState({ state: 'authenticated', user: currentUser });
                // Sync history for the user.
                await syncHistory(currentUser.uid);
            } else {
                // If there is NO user at all, it's a fresh session.
                // We create a new anonymous user. `onAuthStateChanged` will run again.
                setAuthState({ state: 'loading' }); // Briefly show loading while we create the session
                try {
                    await signInAnonymously(auth);
                } catch (error) {
                    console.error("Anonymous sign-in failed:", error);
                    toast.error("Could not start a session. Please refresh the page.");
                    // In a real app, you might want a more robust error state here.
                }
            }
        });

        // The returned function will be called on component unmount to clean up the listener.
        return () => unsubscribe();
      });
  }, [syncHistory]); // The dependency array ensures this runs only once on mount.


  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      // onAuthStateChanged will handle creating a new anonymous user automatically.
      toast.success('You have been signed out.');
    } catch (error: any) {
      console.error('Sign-out failed:', error);
      toast.error('Failed to sign out. Please try again.');
    }
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    // Setting state to loading isn't strictly necessary here since the redirect
    // will navigate the user away, but it can be helpful.
    setAuthState({ state: 'loading' }); 
    try {
        // Use signInWithRedirect, which is best for all devices, especially mobile.
        await signInWithRedirect(auth, provider);
        // The result is handled by `getRedirectResult` in the main useEffect hook.
    } catch (error: any) {
        console.error("Google sign-in error:", error);
        toast.error("Google Sign-In Failed", {
            description: error.message || "An unexpected error occurred."
        });
        // Restore the previous auth state if the redirect fails to initiate.
        if (user) {
            setAuthState({ state: 'authenticated', user });
        }
    }
  };
  
  const value = {
    user,
    authState,
    signOut,
    signInWithGoogle,
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
