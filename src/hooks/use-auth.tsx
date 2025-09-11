
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
      await mergeFirestoreHistory(uid, firestoreHistory);
      console.log('History sync completed successfully.');
    } catch (error) {
      console.error("History sync failed:", error);
    }
  }, []);

  useEffect(() => {
    // This function will be called once to set up the authentication listeners.
    const processAuth = async () => {
      try {
        // First, check if we are coming back from a Google sign-in redirect.
        const result = await getRedirectResult(auth);
        if (result) {
          // If so, the user is signed in. onAuthStateChanged will handle the rest.
          toast.success(`Welcome, ${result.user.displayName}!`);
        }
      } catch (error: any) {
        console.error("Google redirect sign-in error:", error);
        toast.error("Sign-in failed", { description: "Could not complete sign-in with Google." });
      }

      // Now, set up the primary listener for auth state changes.
      // This will fire right away with the cached user, and again if the state changes.
      const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        if (currentUser) {
          // Case 1: A user is signed in (from cache, redirect, or previous session).
          setUser(currentUser);
          setAuthState({ state: 'authenticated', user: currentUser });
          if (!currentUser.isAnonymous) {
            // Sync history for logged-in users.
            await syncHistory(currentUser.uid);
          }
        } else {
          // Case 2: No user is signed in.
          if (navigator.onLine) {
            // If online, create a new anonymous session. This will cause onAuthStateChanged to run again.
            try {
              await signInAnonymously(auth);
            } catch (error) {
              console.error("Anonymous sign-in failed:", error);
              // If anonymous sign-in fails, we are in an unauthenticated state.
              setAuthState({ state: 'authenticated', user: null }); 
            }
          } else {
            // If OFFLINE, we can't create an anonymous user.
            // We end the loading state, leaving the user as null. The UI will handle this.
            console.warn("Offline: Cannot create anonymous session. The app will be in a read-only state until online.");
            setUser(null);
            setAuthState({ state: 'authenticated', user: null });
          }
        }
      });

      return unsubscribe; // Return the cleanup function.
    };

    const unsubscribePromise = processAuth();

    // Return a cleanup function for the useEffect hook.
    return () => {
        unsubscribePromise.then(unsubscribe => {
            if (unsubscribe) {
                unsubscribe();
            }
        });
    };
  }, [syncHistory]);


  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      // After sign-out, onAuthStateChanged will automatically handle creating a new anonymous user when online.
      toast.success('You have been signed out.');
    } catch (error: any) {
      console.error('Sign-out failed:', error);
      toast.error('Failed to sign out. Please try again.');
    }
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      // Use redirect for a more mobile-friendly experience.
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
