

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
  triggerSync: () => void; // Add this to allow manual sync trigger
}

// Create the context with a default undefined value
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Define the props for the AuthProvider component
interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [authState, setAuthState] = useState<AuthState>({ state: 'loading' });
  const [syncTrigger, setSyncTrigger] = useState(0);

  const triggerSync = useCallback(() => {
    setSyncTrigger(count => count + 1);
  }, []);

  useEffect(() => {
    const handleRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          const user = result.user;
          setAuthState({ state: 'authenticated', user });
          toast.success(`Welcome, ${user.displayName}!`);
          triggerSync(); // Trigger a sync after redirect login
        }
      } catch (error: any) {
        console.error("Error processing redirect result:", error);
        if (error.code === 'auth/account-exists-with-different-credential') {
          toast.error("Sign-In Failed", {
            description: 'An account already exists with this email. Please sign in with the original method.'
          });
        } else {
          toast.error("Sign-In Error", {
            description: "There was a problem during the sign-in process."
          });
        }
      }
    };
    
    handleRedirect();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthState({ state: 'authenticated', user });
      } else {
        setAuthState({ state: 'unauthenticated' });
      }
    });

    return () => unsubscribe();
  }, [triggerSync]);


  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      // State will be updated by onAuthStateChanged listener
      toast.success('You have been signed out.');
    } catch (error) {
      console.error('Sign-out failed:', error);
      toast.error('Failed to sign out. Please try again.');
    }
  };

  const signInWithProvider = async (provider: GoogleAuthProvider | FacebookAuthProvider) => {
    try {
      await signInWithRedirect(auth, provider);
    } catch (error: any) {
      console.error("Sign-in error:", error);
       if (error.code === 'auth/popup-closed-by-user') {
        toast.info("Sign-in cancelled", {
          description: "The sign-in window was closed before completion."
        });
      } else if (error.code === 'auth/account-exists-with-different-credential') {
        toast.error("Sign-In Failed", {
          description: 'An account already exists with this email. Please sign in with the original method.'
        });
      } else {
        toast.error("Sign-In Failed", {
          description: error.message || "Could not complete the sign-in process."
        });
      }
    }
  };

  const signInWithGoogle = () => signInWithProvider(new GoogleAuthProvider());
  const signInWithFacebook = () => signInWithProvider(new FacebookAuthProvider());

  const value = {
    user: authState.state === 'authenticated' ? authState.user : null,
    authState,
    signOut,
    signInWithGoogle,
    signInWithFacebook,
    triggerSync, // Expose the trigger
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

    