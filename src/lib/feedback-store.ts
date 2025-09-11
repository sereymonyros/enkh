
import { create } from 'zustand';
import type { Timestamp } from 'firebase/firestore';

// Define the shape of a feedback item, including a potential client-side date
export type Feedback = {
  id: string; // Can be a server ID or a temporary client-side ID
  rating: number;
  comment: string;
  createdAt: Date | Timestamp; // Allow both for optimistic and server items
  status: 'new' | 'viewed' | 'in-progress' | 'fixed';
};

export type OptimisticFeedback = Feedback;

// Define the state and actions for our store
type FeedbackStore = {
  optimisticFeedback: OptimisticFeedback[];
  serverFeedback: Feedback[];
  feedbackCount: number;
  addOptimisticFeedback: (feedback: OptimisticFeedback) => void;
  setServerFeedback: (feedback: Feedback[]) => void;
};

export const useFeedbackStore = create<FeedbackStore>((set) => ({
  optimisticFeedback: [],
  serverFeedback: [],
  feedbackCount: 0,
  addOptimisticFeedback: (feedback) =>
    set((state) => ({
      optimisticFeedback: [...state.optimisticFeedback, feedback],
    })),
  setServerFeedback: (feedback) => 
    set({ 
        serverFeedback: feedback,
        feedbackCount: feedback.length
    }),
}));
