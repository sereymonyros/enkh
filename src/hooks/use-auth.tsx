
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
    const processAuth = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          toast.success(`Welcome, ${result.user.displayName}!`);
          // History sync will be handled by the onAuthStateChanged listener
        }
      } catch (error: any) {
        // Handle failed redirects gracefully.
        console.error("Google redirect sign-in error:", error);
        toast.error("Sign-in failed", { description: "Could not complete sign-in with Google." });
      }

      const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        if (currentUser) {
          // A user is found (from cache, redirect, or server)
          setUser(currentUser);
          setAuthState({ state: 'authenticated', user: currentUser });
          if (!currentUser.isAnonymous) {
            await syncHistory(currentUser.uid);
          }
        } else {
          // No user is currently signed in.
          if (navigator.onLine) {
            // If online, create a new anonymous user. onAuthStateChanged will run again.
            try {
              await signInAnonymously(auth);
            } catch (error) {
              console.error("Anonymous sign-in failed:", error);
              setAuthState({ state: 'authenticated', user: null }); // End loading
              toast.error("Could not start a session. Please refresh the page.");
            }
          } else {
            // If OFFLINE, we can't create an anonymous user.
            // We end the loading state, leaving the user as null. The UI will handle this.
            console.warn("Offline: Cannot create anonymous session. User is not signed in.");
            setUser(null);
            setAuthState({ state: 'authenticated', user: null });
          }
        }
      });

      return unsubscribe;
    };

    const unsubscribePromise = processAuth();

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
      // onAuthStateChanged will handle creating a new anonymous user automatically when online.
      toast.success('You have been signed out.');
    } catch (error: any) {
      console.error('Sign-out failed:', error);
      toast.error('Failed to sign out. Please try again.');
    }
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
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

    