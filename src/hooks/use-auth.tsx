
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
  signInWithPopup,
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
    // This listener handles all auth state changes.
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Case 1: A user is signed in (either anonymous or Google).
        setUser(currentUser);
        setAuthState({ state: 'authenticated', user: currentUser });
      } else {
        // Case 2: No user is signed in. This happens on first load or after sign-out.
        if (navigator.onLine) {
          try {
            // Attempt to create a new anonymous session. This will cause this listener to run again.
            await signInAnonymously(auth);
          } catch (error) {
            console.error("Anonymous sign-in failed:", error);
            // If even anonymous sign-in fails, we are unauthenticated.
            setAuthState({ state: 'authenticated', user: null });
          }
        } else {
          // If offline and no user is cached, we cannot sign in.
          console.warn("Offline: Cannot create anonymous session. App will be in a limited state.");
          setUser(null);
          setAuthState({ state: 'authenticated', user: null });
        }
      }
    });

    return () => unsubscribe(); // Cleanup the listener on unmount.
  }, []); // Empty dependency array, runs once on mount


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
      // For desktop, use popup
      const result = await signInWithPopup(auth, provider);
      if (result && result.user) {
        toast.success(`Welcome, ${result.user.displayName}!`);
        await syncHistory(result.user.uid);
      }
    } catch (error: any) {
      console.error("Google sign-in error:", error);

      // Handle specific pop-up closed error for desktop
      if (error.code === 'auth/popup-closed-by-user') {
        toast.info("Google sign-in cancelled.", {
          description: "You closed the pop-up without signing in."
        });
      } else if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-blocked') {
        toast.error("Sign-in popup was blocked.", {
          description: "Please allow popups for this site and try again."
        });
      }
      else {
        // Generic error for others
        toast.error("Google Sign-In Failed", {
          description: error.message || "An unexpected error occurred."
        });
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
