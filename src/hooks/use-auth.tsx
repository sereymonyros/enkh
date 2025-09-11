
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
    // This is the core listener for all auth changes.
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser); // Always set the user, even if null
      setAuthState({ state: 'authenticated', user: currentUser });

      if (currentUser && !currentUser.isAnonymous) {
        // If a real user is logged in, sync their history.
        await syncHistory(currentUser.uid);
      }
    });

    // Handle the redirect result on initial load.
    getRedirectResult(auth)
      .then(async (result) => {
        if (result) {
          // User has just signed in via redirect.
          toast.success(`Welcome, ${result.user.displayName}!`);
          // History sync will be triggered by onAuthStateChanged.
        } else if (!auth.currentUser) {
          // No redirect result and no current user, so sign in anonymously.
          // This only runs on the very first visit.
          signInAnonymously(auth).catch((error) => {
            console.error("Anonymous sign-in failed on initial load:", error);
          });
        }
      })
      .catch((error) => {
        console.error("Error processing redirect result:", error);
        toast.error("Sign-In Failed", {
          description: "There was a problem during sign-in. Please try again."
        });
      });

    return () => unsubscribe();
  }, [syncHistory]);


  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      // After sign-out, onAuthStateChanged will fire. We then sign in a new anonymous user.
      await signInAnonymously(auth);
      toast.success('You have been signed out.');
    } catch (error: any) {
      console.error('Sign-out failed:', error);
      toast.error('Failed to sign out. Please try again.');
    }
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      // Use redirect for maximum compatibility across all browsers and devices.
      await signInWithRedirect(auth, provider);
    } catch (error: any) {
      console.error("Google sign-in error:", error);
      toast.error("Google Sign-In Failed", {
        description: error.message || "Could not start the sign-in process."
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
