// Import the functions you need from the SDKs you need
import {initializeApp, getApp, getApps} from 'firebase/app';
import {getFirestore, enableIndexedDbPersistence} from 'firebase/firestore';

// Your web app's Firebase configuration
// This configuration is PUBLIC and safe to expose in client-side code.
// Security is handled by Firebase Security Rules on the backend.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};


// Initialize Firebase
// This pattern prevents re-initializing the app on every hot-reload.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

// Enable offline persistence.
// This must be done after initializing Firestore.
// We wrap it in a try-catch block to handle potential errors,
// such as when multiple browser tabs are open.
try {
    enableIndexedDbPersistence(db)
      .catch((err) => {
        if (err.code == 'failed-precondition') {
            // Multiple tabs open, persistence can only be enabled in one tab at a time.
            console.warn('Firestore persistence failed: multiple tabs open.');
        } else if (err.code == 'unimplemented') {
            // The current browser does not support all of the
            // features required to enable persistence
            console.warn('Firestore persistence not available in this browser.');
        }
    });
} catch (error) {
    console.error("Error enabling Firestore persistence:", error);
}


export {app, db};
