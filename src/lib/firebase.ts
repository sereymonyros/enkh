// Import the functions you need from the SDKs you need
import {initializeApp, getApp, getApps} from 'firebase/app';
import {getFirestore} from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: "enkh-ovr0a.firebaseapp.com",
  projectId: "enkh-ovr0a",
  storageBucket: "enkh-ovr0a.firebasestorage.app",
  messagingSenderId: "797985931687",
  appId: "1:797985931687:web:938b1dce3a931f67447682"
};


// Initialize Firebase
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

export {app, db};
