
'use client';
// This file manages all interactions with the browser's built-in IndexedDB database.
// It uses the 'idb' library, which is a small wrapper that makes IndexedDB easier to use.

import { openDB, DBSchema, IDBPDatabase } from 'idb';

// Define constants for the database. This avoids magic strings in the code.
const DB_NAME = 'enkh-db'; // The name of our database.
const DB_VERSION = 3; // The version of our database schema.
const TRANSLATIONS_STORE_NAME = 'translations'; // The name of the "table" (called an object store) inside the DB.
const HISTORY_STORE_NAME = 'history';

// Define the structure of a single record (a translation entry) in our database.
// This is for TypeScript, to ensure type safety.
interface TranslationEntry {
  normalizedText: string;
  sourceLanguage: 'en' | 'km';
  targetLanguage: 'en' | 'km';
  translatedText: string;
  createdAt: Date;
}

export interface HistoryEntry {
  id?: number; // Local auto-incrementing ID
  firestoreId?: string; // ID from Firestore for syncing
  userId: string;
  originalText: string;
  translatedText: string;
  sourceLanguage: 'en' | 'km';
  targetLanguage: 'en' | 'km';
  createdAt: Date;
}


// Define the entire database schema, including all its object stores and their indexes.
interface EnkhDB extends DBSchema {
  [TRANSLATIONS_STORE_NAME]: {
    key: [string, 'en' | 'km', 'en' | 'km'];
    value: TranslationEntry;
    indexes: { 'by-query': [string, 'en' | 'km', 'en' | 'km'] };
  };
  [HISTORY_STORE_NAME]: {
    key: number;
    value: HistoryEntry;
    indexes: { 'by-user': string; 'by-firestore-id': string };
  };
}

let dbPromise: Promise<IDBPDatabase<EnkhDB>> | null = null;

const getDb = () => {
  if (!dbPromise) {
    dbPromise = openDB<EnkhDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        // Runs when the schema needs to be created or updated.
        if (oldVersion < 1) {
            const translationsStore = db.createObjectStore(TRANSLATIONS_STORE_NAME, {
                keyPath: ['normalizedText', 'sourceLanguage', 'targetLanguage'],
            });
            translationsStore.createIndex('by-query', ['normalizedText', 'sourceLanguage', 'targetLanguage']);
        }
        if (oldVersion < 2) {
            const historyStore = db.createObjectStore(HISTORY_STORE_NAME, {
                keyPath: 'id',
                autoIncrement: true,
            });
            historyStore.createIndex('by-user', 'userId');
        }
        if (oldVersion < 3) {
            const historyStore = transaction.objectStore(HISTORY_STORE_NAME);
            // Add an index for the Firestore ID to easily check for existing items during sync.
            historyStore.createIndex('by-firestore-id', 'firestoreId');
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Retrieves a single translation from the public local cache.
 */
export async function getTranslationFromDb(
  normalizedText: string,
  sourceLanguage: 'en' | 'km',
  targetLanguage: 'en' | 'km'
): Promise<TranslationEntry | null> {
  const db = await getDb();
  const result = await db.get(TRANSLATIONS_STORE_NAME, [normalizedText, sourceLanguage, targetLanguage]);
  return result ?? null;
}

/**
 * Saves or updates a translation in the public local cache.
 */
export async function saveTranslationToDb(
  normalizedText: string,
  sourceLanguage: 'en' | 'km',
  targetLanguage: 'en' | 'km',
  translatedText: string
): Promise<void> {
  const db = await getDb();
  await db.put(TRANSLATIONS_STORE_NAME, {
    normalizedText,
    sourceLanguage,
    targetLanguage,
    translatedText,
    createdAt: new Date(),
  });
}

/**
 * Adds a new entry to the user's private translation history.
 * @param item The history item to add. The userId must be set.
 */
export async function addHistoryItem(item: Omit<HistoryEntry, 'id' | 'createdAt'>): Promise<number> {
    const db = await getDb();
    const newEntry: HistoryEntry = {
        ...item,
        createdAt: new Date(),
    }
    const id = await db.add(HISTORY_STORE_NAME, newEntry);
    return id;
}


/**
 * Retrieves the translation history for a specific user, sorted from newest to oldest.
 * @param userId The UID of the user.
 * @returns An array of history entries.
 */
export async function getHistoryForUser(userId: string): Promise<HistoryEntry[]> {
    const db = await getDb();
    const items = await db.getAllFromIndex(HISTORY_STORE_NAME, 'by-user', userId);
    // The items are not guaranteed to be sorted by date from the index,
    // so we sort them here explicitly in descending order (newest first).
    return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Merges history from Firestore into the local IndexedDB, avoiding duplicates.
 * This is a robust function to prevent race conditions and duplicate entries.
 * @param userId The UID of the user.
 * @param firestoreHistory The array of history items fetched from Firestore.
 */
export async function mergeFirestoreHistory(userId: string, firestoreHistory: any[]): Promise<void> {
    const db = await getDb();
    const tx = db.transaction(HISTORY_STORE_NAME, 'readwrite');
    const store = tx.objectStore(HISTORY_STORE_NAME);

    for (const remoteItem of firestoreHistory) {
        if (!remoteItem.id) continue; // Skip items without a firestore ID

        // 1. Check if a record with this Firestore ID already exists.
        const existingById = await store.index('by-firestore-id').get(remoteItem.id);
        if (existingById) {
            continue; // Record is already synced. Do nothing.
        }

        // 2. If not found by ID, search for a local-only "pending" record that matches the content.
        // This handles the race condition where a local record was created but not yet updated with the Firestore ID.
        let matchFound = false;
        const allLocalItems = await store.index('by-user').getAll(userId);
        
        for (const localItem of allLocalItems) {
            // A "pending" record has no firestoreId and should match content.
            if (!localItem.firestoreId &&
                localItem.originalText === remoteItem.originalText &&
                localItem.translatedText === remoteItem.translatedText
            ) {
                // We found a matching local record. Update it with the Firestore ID.
                localItem.firestoreId = remoteItem.id;
                // It's good practice to use the server's timestamp as the source of truth.
                localItem.createdAt = new Date(remoteItem.createdAt); 
                await store.put(localItem);
                matchFound = true;
                break; // Stop searching once a match is found and updated for this remoteItem.
            }
        }
        
        // 3. If no match was found by ID or by content, add it as a new record.
        // This means it's a genuinely new record from another device.
        if (!matchFound) {
            await store.add({
                userId: userId,
                firestoreId: remoteItem.id,
                originalText: remoteItem.originalText,
                translatedText: remoteItem.translatedText,
                sourceLanguage: remoteItem.sourceLanguage,
                targetLanguage: remoteItem.targetLanguage,
                createdAt: new Date(remoteItem.createdAt),
            });
        }
    }
    
    await tx.done;
}


/**
 * Associates a local history item with its new Firestore ID after a successful sync.
 */
export async function updateHistoryItemWithFirestoreId(localId: number, firestoreId: string): Promise<void> {
    const db = await getDb();
    const item = await db.get(HISTORY_STORE_NAME, localId);
    if (item) {
        // Avoid overwriting if another process (like merge) already set the ID.
        if (!item.firestoreId) {
            item.firestoreId = firestoreId;
            await db.put(HISTORY_STORE_NAME, item);
        }
    }
}
