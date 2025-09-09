// This file contains the logic for seeding the user's local database (IndexedDB).
// "Seeding" means populating the database with an initial set of data.
'use client'; // This directive is crucial. It ensures this code only runs in the browser.

import { saveTranslationToDb } from './db';
import { seedData } from './seed-data';

// Define a key for localStorage. Using a constant prevents typos.
const DB_SEEDED_FLAG_KEY = 'enkh_db_seeded_v1';

/**
 * Checks if the database has been seeded and, if not, populates it with
 * common phrases. This function is designed to run only once per user, per device.
 */
export async function seedDatabaseIfNeeded() {
  // --- STEP 1: Check if the seeding process has already run ---
  // We use localStorage for this check because it's a very simple, synchronous
  // key-value store, perfect for a simple flag like this.
  // It's much simpler than using IndexedDB just for one "yes/no" value.
  if (localStorage.getItem(DB_SEEDED_FLAG_KEY)) {
    console.log('DB Seeder: Database is already seeded. Skipping.');
    return; // Exit the function early if the flag is found.
  }

  console.log('DB Seeder: Database has not been seeded. Starting process...');

  try {
    // --- STEP 2: Loop through the seed data and populate the database ---
    // We use Promise.all to run all the database-saving operations concurrently.
    // This is more efficient than saving them one by one in a loop.
    await Promise.all(
      seedData.map(async (entry) => {
        // For each entry (e.g., { en: "Hello", km: "សួស្តី" }), we create two cache entries:
        // 1. English to Khmer ("hello" -> "សួស្តី")
        // 2. Khmer to English ("សួស្តី" -> "hello")
        // This makes our bidirectional translation work seamlessly from the cache.

        // The text is normalized (lowercase, trimmed) to ensure consistent caching.
        const normalizedEn = entry.en.trim().toLowerCase();
        const normalizedKm = entry.km.trim().toLowerCase();

        // Save the English-to-Khmer translation.
        await saveTranslationToDb(normalizedEn, 'en', 'km', entry.km);
        // Save the Khmer-to-English translation.
        await saveTranslationToDb(normalizedKm, 'km', 'en', entry.en);
      })
    );

    // --- STEP 3: Set the flag to prevent this from running again ---
    // Once the seeding is successful, we set the flag in localStorage.
    // The next time seedDatabaseIfNeeded() is called, it will find this flag
    // at the beginning of the function and exit immediately.
    localStorage.setItem(DB_SEEDED_FLAG_KEY, 'true');
    console.log('DB Seeder: Seeding complete and flag set.');
  } catch (error) {
    // If any part of the seeding process fails, we log the error.
    // We don't set the flag so the app can try again on the next page load.
    console.error('DB Seeder: An error occurred during database seeding:', error);
  }
}
