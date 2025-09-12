
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
    // onAuthStateChanged is the single source of truth for auth state.
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setAuthState({ state: 'authenticated', user: currentUser });
        await syncHistory(currentUser.uid);
      } else {
        setUser(null);
        setAuthState({ state: 'unauthenticated' });
      }
    });
    
    // Separately, handle the result of a redirect operation on initial load.
    // This doesn't set the state directly, but might provide a welcome message.
    getRedirectResult(auth)
      .then((result) => {
        if (result) {
          toast.success(`Welcome, ${result.user.displayName}!`);
        }
      })
      .catch((error) => {
        console.error("Error processing redirect result:", error);
        if (error.code === 'auth/account-exists-with-different-credential') {
          toast.error("Sign-In Failed", {
            description: 'An account already exists with this email address. Please sign in with the original method.'
          });
        }
      });

    return () => unsubscribe();
  }, [syncHistory]);


  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
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
        description: error.message || "Could not start the sign-in process."
      });
    }
  };

  const signInWithFacebook = async () => {
    const provider = new FacebookAuthProvider();
    provider.setCustomParameters({
      'scope': 'public_profile'
    });
    
    try {
      // Use signInWithPopup for Facebook to avoid redirect issues.
      const result = await signInWithPopup(auth, provider);
      // onAuthStateChanged will handle the state update, but we can show a toast here.
      toast.success(`Welcome, ${result.user.displayName}!`);
    } catch (error: any) {
      // Don't show an error toast if the user cancelled the popup.
      if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        console.log("Facebook sign-in cancelled by user.");
        return;
      }

      console.error("Facebook sign-in error:", error);
      let description = error.message || "Could not complete the sign-in process.";
       if (error.code === 'auth/account-exists-with-different-credential') {
          description = 'An account already exists with this email address. Please sign in with the original method.'
        } else if (error.code === 'auth/unauthorized-domain') {
          description = 'This domain is not authorized for Facebook sign-in. Please check your Firebase project settings.'
        }
      toast.error("Facebook Sign-In Failed", {
        description: description,
      });
    }
  };

  const value = {
    user,
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
