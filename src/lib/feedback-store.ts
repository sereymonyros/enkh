
import { create } from 'zustand';
import type { Timestamp } from 'firebase/firestore';

// Define the shape of a feedback item, including a potential client-side date
export type OptimisticFeedback = {
  id: string; // Can be a server ID or a temporary client-side ID
  rating: number;
  comment: string;
  createdAt: Date | Timestamp; // Allow both for optimistic and server items
  status: 'new' | 'viewed' | 'in-progress' | 'fixed';
};

// Define the state and actions for our store
type FeedbackStore = {
  optimisticFeedback: OptimisticFeedback[];
  addOptimisticFeedback: (feedback: OptimisticFeedback) => void;
  // We might need a 'remove' action later if submissions fail
};

export const useFeedbackStore = create<FeedbackStore>((set) => ({
  optimisticFeedback: [],
  addOptimisticFeedback: (feedback) =>
    set((state) => ({
      optimisticFeedback: [...state.optimisticFeedback, feedback],
    })),
}));
