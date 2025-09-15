// This file is for SERVER-SIDE use only.
// It initializes the Firebase Admin SDK.

import admin from 'firebase-admin';

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : null;

if (serviceAccount && !admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('Firebase Admin SDK initialized successfully.');
  } catch (error: any) {
    console.error('Firebase Admin initialization error:', error.message);
  }
}

const adminAuth = admin.apps.length ? admin.auth() : null;

export { adminAuth };
