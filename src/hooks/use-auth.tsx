
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
    // This handles the result of a redirect sign-in.
    getRedirectResult(auth)
      .then((result) => {
        if (result) {
          // User successfully signed in via redirect.
          // onAuthStateChanged will handle the rest.
          toast.success(`Welcome, ${result.user.displayName}!`);
        }
      })
      .catch((error) => {
        // Handle errors here if needed.
        console.error("Google redirect sign-in error:", error);
        toast.error("Sign-in failed", { description: "Could not complete sign-in with Google."});
      })
      .finally(() => {
        // Now, set up the regular auth state listener.
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
                setAuthState({ state: 'authenticated', user: currentUser });
                // Sync history for both anonymous and non-anonymous users
                await syncHistory(currentUser.uid);
            } else {
                // If no user, sign in anonymously. onAuthStateChanged will run again.
                setAuthState({ state: 'loading'});
                try {
                    await signInAnonymously(auth);
                } catch (error) {
                    console.error("Anonymous sign-in failed:", error);
                    toast.error("Could not start a session. Please refresh the page.");
                }
            }
        });
        return () => unsubscribe();
      });
  }, [syncHistory]);


  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      // onAuthStateChanged will handle creating a new anonymous user
      toast.success('You have been signed out.');
    } catch (error: any) {
      console.error('Sign-out failed:', error);
      toast.error('Failed to sign out. Please try again.');
    }
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    setAuthState({ state: 'loading' });
    try {
        // Use signInWithRedirect which is more mobile-friendly
        await signInWithRedirect(auth, provider);
        // The result is handled by the getRedirectResult in the useEffect hook.
    } catch (error: any) {
        console.error("Google sign-in error:", error);
        toast.error("Google Sign-In Failed", {
            description: error.message || "An unexpected error occurred."
        });
        // If sign-in fails, the user remains in their previous state (likely anonymous)
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
