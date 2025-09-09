
'use server';
/**
 * @fileOverview A developer utility flow to clear the translations collection in Firestore.
 *
 * - clearTranslations - Deletes all documents from the 'translations' collection.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import {collection, getDocs, writeBatch, doc} from 'firebase/firestore';
import {db} from '@/lib/firebase';

const ClearTranslationsOutputSchema = z.object({
  deletedCount: z.number().describe('The number of documents deleted.'),
});
export type ClearTranslationsOutput = z.infer<typeof ClearTranslationsOutputSchema>;

// This flow doesn't take any input, so we use z.void()
const ClearTranslationsInputSchema = z.void();
export type ClearTranslationsInput = z.infer<typeof ClearTranslationsInputSchema>;


export async function clearTranslations(input?: ClearTranslationsInput): Promise<ClearTranslationsOutput> {
  return clearTranslationsFlow(input);
}


const clearTranslationsFlow = ai.defineFlow(
  {
    name: 'clearTranslationsFlow',
    inputSchema: ClearTranslationsInputSchema,
    outputSchema: ClearTranslationsOutputSchema,
  },
  async () => {
    console.log('CLEARING FIRESTORE: Starting process to delete all translations...');
    const translationsCollection = collection(db, 'translations');
    const querySnapshot = await getDocs(translationsCollection);

    const count = querySnapshot.size;
    if (count === 0) {
      console.log('CLEARING FIRESTORE: Collection is already empty.');
      return {deletedCount: 0};
    }
    
    // Firestore batches can handle up to 500 operations.
    // If you expect more documents, you would need to loop through multiple batches.
    const batch = writeBatch(db);
    querySnapshot.forEach(docSnap => {
      batch.delete(doc(db, 'translations', docSnap.id));
    });

    await batch.commit();

    console.log(`CLEARING FIRESTORE: Successfully deleted ${count} documents.`);
    return {deletedCount: count};
  }
);
