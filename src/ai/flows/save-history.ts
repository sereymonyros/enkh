
'use server';

/**
 * @fileOverview Flow to save a user's translation history to Firestore.
 *
 * - saveHistory - A function that saves a translation record to a user-specific collection.
 * - SaveHistoryInput - The input type for the saveHistory function.
 * - SaveHistoryOutput - The return type for the save-history function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import {
  collection,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {db} from '@/lib/firebase';

const SaveHistoryInputSchema = z.object({
  userId: z.string().describe('The UID of the user.'),
  originalText: z.string().describe('The original text that was translated.'),
  translatedText: z.string().describe('The resulting translated text.'),
  sourceLanguage: z.enum(['en', 'km']).describe('The source language.'),
  targetLanguage: z.enum(['en', 'km']).describe('The target language.'),
});
export type SaveHistoryInput = z.infer<typeof SaveHistoryInputSchema>;

const SaveHistoryOutputSchema = z.object({
  documentId: z.string().describe('The ID of the newly created Firestore document.'),
});
export type SaveHistoryOutput = z.infer<typeof SaveHistoryOutputSchema>;


export async function saveHistory(input: SaveHistoryInput): Promise<SaveHistoryOutput> {
    return saveHistoryFlow(input);
}


const saveHistoryFlow = ai.defineFlow(
  {
    name: 'saveHistoryFlow',
    inputSchema: SaveHistoryInputSchema,
    outputSchema: SaveHistoryOutputSchema,
  },
  async (input) => {
    // A user must be provided.
    if (!input.userId) {
        throw new Error('A user ID must be provided to save history.');
    }

    console.log(`SYNC: Saving history to Firestore for user ${input.userId}...`);

    // The path to the user's private history subcollection.
    const historyCollection = collection(db, 'users', input.userId, 'history');

    const docRef = await addDoc(historyCollection, {
        originalText: input.originalText,
        translatedText: input.translatedText,
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
        createdAt: serverTimestamp(),
    });
    
    console.log(`   ✅ SYNC SUCCESS: Firestore document created with ID: ${docRef.id}`);

    return { documentId: docRef.id };
  }
);
