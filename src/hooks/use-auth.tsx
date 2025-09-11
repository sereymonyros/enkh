
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
  getRedirectResult,
  signInWithRedirect,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { toast } from 'sonner';
import { getHistory } from '@/ai/flows/get-history';
import { mergeFirestoreHistory } from '@/lib/db';

export type AuthState =
  | { state: 'loading' }
  | { state: 'authenticated'; user: User | null };

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
    // Only attempt to sync history if the user is online.
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
    // This effect runs once on initial load to handle the redirect result
    // and set up the auth state listener.
    getRedirectResult(auth)
      .then(async (result) => {
        if (result) {
          // User has just signed in via redirect.
          toast.success(`Welcome, ${result.user.displayName}!`);
          // Sync their history from the cloud.
          await syncHistory(result.user.uid);
        }
        // If result is null, it means it's a normal page load, not a redirect.
      })
      .catch((error) => {
        console.error("Google sign-in redirect error:", error);
        toast.error("Google Sign-In Failed", {
          description: error.message || "An unexpected error occurred during redirect."
        });
      })
      .finally(() => {
        // This listener handles all subsequent auth state changes.
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
          if (currentUser) {
            // A user is signed in (anonymous or Google).
            setUser(currentUser);
            setAuthState({ state: 'authenticated', user: currentUser });
          } else {
            // No user is signed in, this happens on first visit or after sign-out.
            try {
              // Attempt to create a new anonymous session.
              await signInAnonymously(auth);
            } catch (error) {
              console.error("Anonymous sign-in failed:", error);
              setAuthState({ state: 'authenticated', user: null });
            }
          }
        });
        return () => unsubscribe();
      });
  }, [syncHistory]);


  const signOut = async () => {
    try {
      const user = auth.currentUser;
      const wasAnonymous = user?.isAnonymous;

      await firebaseSignOut(auth);
      // onAuthStateChanged will handle creating a new anonymous user automatically.

      if (!wasAnonymous) {
        toast.success('You have been signed out.');
      }

    } catch (error: any) {
      console.error('Sign-out failed:', error);
      toast.error('Failed to sign out. Please try again.');
    }
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      // Use redirect for all devices for maximum compatibility.
      await signInWithRedirect(auth, provider);
    } catch (error: any) {
      console.error("Google sign-in error:", error);
      toast.error("Google Sign-In Failed", {
        description: error.message || "An unexpected error occurred."
      });
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
