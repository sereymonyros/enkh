
'use client';

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { HistoryEntryForClient } from '@/ai/flows/get-history';

// Define the schema for our database.
interface EnkhDB extends DBSchema {
  translations: {
    key: string;
    value: {
      normalizedText: string;
      sourceLanguage: 'en' | 'km';
      targetLanguage: 'en' | 'km';
      translatedText: string;
      createdAt: Date;
    };
    indexes: { 'text-source-target': [string, string, string] };
  };
  history: {
    key: string; // The Firestore document ID
    value: HistoryEntry;
    indexes: { 'by-user': string };
  };
}

export interface HistoryEntry {
  id: string; // The Firestore document ID, used as the primary key.
  userId: string;
  originalText: string;
  translatedText: string;
  sourceLanguage: 'en' | 'km';
  targetLanguage: 'en' | 'km';
  createdAt: number; // Store as timestamp (milliseconds)
}


let dbPromise: Promise<IDBPDatabase<EnkhDB>> | null = null;

const getDb = (): Promise<IDBPDatabase<EnkhDB>> => {
    if (!dbPromise) {
        dbPromise = openDB<EnkhDB>('enkh-db', 4, {
            upgrade(db, oldVersion, newVersion, tx) {
                if (oldVersion < 1) {
                    const translationsStore = db.createObjectStore('translations', {
                        keyPath: 'key',
                    });
                    translationsStore.createIndex('text-source-target', [
                        'normalizedText',
                        'sourceLanguage',
                        'targetLanguage',
                    ]);
                }
                if (oldVersion < 2) {
                     db.createObjectStore('history', {
                        keyPath: 'userId',
                    });
                }
                if (oldVersion < 3) {
                    if (db.objectStoreNames.contains('history')) {
                        db.deleteObjectStore('history');
                    }
                    const historyStore = db.createObjectStore('history', {
                      keyPath: 'id',
                      autoIncrement: true,
                    });
                    historyStore.createIndex('by-user', 'userId');
                }
                if (oldVersion < 4) {
                    // Re-create the history store to use the firestore ID as the primary key.
                    // This is a breaking change that requires deleting old data.
                    if (db.objectStoreNames.contains('history')) {
                        db.deleteObjectStore('history');
                    }
                     const historyStore = db.createObjectStore('history', {
                      keyPath: 'id', // Use the firestore ID as the key
                    });
                    historyStore.createIndex('by-user', 'userId');
                }
            },
        });
    }
    return dbPromise;
};


const normalizeText = (text: string) => {
  return text.trim().toLowerCase();
};

export async function saveTranslationToDb(
  originalText: string,
  sourceLanguage: 'en' | 'km',
  targetLanguage: 'en' | 'km',
  translatedText: string
): Promise<void> {
  const db = await getDb();
  const normalizedOriginal = normalizeText(originalText);
  const key = `${normalizedOriginal}:${sourceLanguage}:${targetLanguage}`;

  await db.put('translations', {
    key,
    normalizedText: normalizedOriginal,
    sourceLanguage,
    targetLanguage,
    translatedText,
    createdAt: new Date(),
  });
}

export async function getTranslationFromDb(
  originalText: string,
  sourceLanguage: 'en' | 'km',
  targetLanguage: 'en' | 'km'
): Promise<{ translatedText: string; createdAt: Date } | null> {
  const db = await getDb();
  const normalizedOriginal = normalizeText(originalText);
  const key = `${normalizedOriginal}:${sourceLanguage}:${targetLanguage}`;
  
  const result = await db.get('translations', key);

  return result ? { translatedText: result.translatedText, createdAt: result.createdAt } : null;
}


// --- HISTORY FUNCTIONS ---

export async function getHistoryForUser(userId: string): Promise<HistoryEntry[]> {
    const db = await getDb();
    if (!db.objectStoreNames.contains('history')) {
        return [];
    }
    const items = await db.getAllFromIndex('history', 'by-user', userId);
    // Sort descending by creation date
    return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function clearHistoryForUser(userId: string): Promise<void> {
    const db = await getDb();
    if (!db.objectStoreNames.contains('history')) {
        return;
    }
    const tx = db.transaction('history', 'readwrite');
    const index = tx.store.index('by-user');
    let cursor = await index.openCursor(userId);
    while (cursor) {
        await cursor.delete();
        cursor = await cursor.continue();
    }
    await tx.done;
}

export async function mergeFirestoreHistory(userId: string, firestoreHistory: HistoryEntryForClient[]): Promise<void> {
    const db = await getDb();
    if (!db.objectStoreNames.contains('history')) {
        return;
    }
    const tx = db.transaction('history', 'readwrite');
    const store = tx.objectStore('history');

    for (const firestoreEntry of firestoreHistory) {
        // Use the Firestore document ID as the primary key in IndexedDB
        const localEntry: HistoryEntry = {
            id: firestoreEntry.id,
            userId: userId,
            originalText: firestoreEntry.originalText,
            translatedText: firestoreEntry.translatedText,
            sourceLanguage: firestoreEntry.sourceLanguage,
            targetLanguage: firestoreEntry.targetLanguage,
            createdAt: firestoreEntry.createdAt, // This is already a number (millis)
        };
        // Use 'put' to either insert a new record or update an existing one.
        // This ensures data integrity using the unique Firestore ID.
        await store.put(localEntry);
    }
    await tx.done;
}
