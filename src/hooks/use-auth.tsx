
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
          await syncHistory(result.user.uid);
        }
      } catch (error: any) {
        // Handle failed redirects gracefully.
        console.error("Google redirect sign-in error:", error);
        toast.error("Sign-in failed", { description: "Could not complete sign-in with Google." });
      }

      const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        if (currentUser) {
          // If a user (Google or anonymous) is found in the cache or from the server, set state.
          setUser(currentUser);
          setAuthState({ state: 'authenticated', user: currentUser });
          // If they are a real user, sync their history.
          if (!currentUser.isAnonymous) {
            syncHistory(currentUser.uid);
          }
        } else {
          // This block runs if there's no cached user and the server confirms no one is signed in.
          if (navigator.onLine) {
            // If online, create a new anonymous user. `onAuthStateChanged` will run again.
            try {
              await signInAnonymously(auth);
            } catch (error) {
              console.error("Anonymous sign-in failed:", error);
              setAuthState({ state: 'authenticated', user: null }); // End loading
              toast.error("Could not start a session. Please refresh the page.");
            }
          } else {
            // If OFFLINE and there's no cached user, we can't do anything.
            // We set the state to authenticated with no user, which will show the sign-in button.
            // This prevents the app from getting stuck in a loading loop.
            console.warn("Offline: Cannot create anonymous session. Waiting to come online.");
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
      // onAuthStateChanged will handle creating a new anonymous user automatically.
      toast.success('You have been signed out.');
    } catch (error: any) {
      console.error('Sign-out failed:', error);
      toast.error('Failed to sign out. Please try again.');
    }
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      // Use redirect for all devices. It's more reliable.
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
