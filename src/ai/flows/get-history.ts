
'use server';

/**
 * @fileOverview Flow to retrieve a user's translation history from Firestore.
 *
 * - getHistory - A function that fetches all translation records for a specific user.
 * - GetHistoryInput - The input type for the getHistory function.
 * @returns An array of history entries.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import {
  collection,
  query,
  getDocs,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import {db} from '@/lib/firebase';

const GetHistoryInputSchema = z.object({
  userId: z.string().describe('The UID of the user.'),
});
export type GetHistoryInput = z.infer<typeof GetHistoryInputSchema>;

// We can't use the HistoryEntry type from lib/db.ts because of client/server constraints.
// So, we define a schema for the output that matches that structure.
const HistoryEntrySchema = z.object({
  id: z.string(),
  originalText: z.string(),
  translatedText: z.string(),
  sourceLanguage: z.enum(['en', 'km']),
  targetLanguage: z.enum(['en', 'km']),
  // Firestore Timestamps will be serialized, so we can treat them as objects
  // with toDate() or as plain JS dates if they're converted.
  // For simplicity, we'll handle the conversion on the client.
  createdAt: z.any(),
});
export type HistoryEntryForClient = z.infer<typeof HistoryEntrySchema>;

const GetHistoryOutputSchema = z.array(HistoryEntrySchema);
export type GetHistoryOutput = z.infer<typeof GetHistoryOutputSchema>;


export async function getHistory(input: GetHistoryInput): Promise<GetHistoryOutput> {
    return getHistoryFlow(input);
}


const getHistoryFlow = ai.defineFlow(
  {
    name: 'getHistoryFlow',
    inputSchema: GetHistoryInputSchema,
    outputSchema: GetHistoryOutputSchema,
  },
  async (input) => {
    if (!input.userId) {
        throw new Error('A user ID must be provided to retrieve history.');
    }

    console.log(`SYNC: Fetching history from Firestore for user ${input.userId}...`);

    const historyCollection = collection(db, 'users', input.userId, 'history');
    const q = query(historyCollection, orderBy('createdAt', 'desc'));
    
    const querySnapshot = await getDocs(q);

    const history: HistoryEntryForClient[] = querySnapshot.docs.map(doc => {
      const data = doc.data();
      const createdAt = data.createdAt as Timestamp;

      return {
        id: doc.id,
        originalText: data.originalText,
        translatedText: data.translatedText,
        sourceLanguage: data.sourceLanguage,
        targetLanguage: data.targetLanguage,
        // Convert Firestore Timestamp to a serializable format (milliseconds)
        createdAt: createdAt.toMillis(),
      };
    });
    
    console.log(`   ✅ SYNC SUCCESS: Fetched ${history.length} history documents from Firestore.`);

    return history;
  }
);
