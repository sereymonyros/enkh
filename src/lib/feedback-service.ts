
'use client';

import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type FeedbackData = {
  rating: number;
  comment: string;
};

/**
 * Saves a new feedback entry to the 'feedbacks' collection in Firestore.
 *
 * @param feedbackData An object containing the rating and comment.
 * @returns The ID of the newly created document.
 * @throws Will throw an error if the document cannot be added.
 */
export async function submitFeedback(feedbackData: FeedbackData): Promise<string> {
  if (!feedbackData.rating || !feedbackData.comment.trim()) {
    throw new Error('Both a rating and a comment must be provided.');
  }

  try {
    const feedbackCollection = collection(db, 'feedbacks');
    const docRef = await addDoc(feedbackCollection, {
      ...feedbackData,
      createdAt: serverTimestamp(),
      status: 'new', // Default status for new feedback
    });
    return docRef.id;
  } catch (error) {
    console.error('Error submitting feedback to Firestore:', error);
    // Re-throw the error to be handled by the calling function
    throw new Error('Failed to submit feedback. Please try again.');
  }
}
