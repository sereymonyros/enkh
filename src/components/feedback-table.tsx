
'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useFeedbackStore, OptimisticFeedback } from '@/lib/feedback-store';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

type Feedback = {
  id: string;
  rating: number;
  comment: string;
  createdAt: Timestamp;
  status: 'new' | 'viewed' | 'in-progress' | 'fixed';
};

// A type guard to check if an object is a Firestore Timestamp
function isTimestamp(date: any): date is Timestamp {
  return date && typeof date.toDate === 'function';
}


const StatusBadge = ({ status }: { status: Feedback['status'] }) => {
  const variant = {
    new: 'default',
    viewed: 'secondary',
    'in-progress': 'outline',
    fixed: 'destructive',
  }[status] as 'default' | 'secondary' | 'outline' | 'destructive' | undefined;

  return <Badge variant={variant}>{status}</Badge>;
};


const RatingStars = ({ rating }: { rating: number }) => {
    if (rating === 0) {
        return <span className="text-muted-foreground">-</span>
    }
    return (
        <div className="flex items-center">
            {[...Array(rating)].map((_, i) => (
                <Star key={i} className="h-4 w-4 text-blue-400 fill-blue-400" />
            ))}
            {[...Array(5 - rating)].map((_, i) => (
                <Star key={i} className="h-4 w-4 text-muted-foreground" />
            ))}
        </div>
    )
}

export function FeedbackTable() {
  const [serverFeedback, setServerFeedback] = useState<Feedback[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const optimisticFeedback = useFeedbackStore((state) => state.optimisticFeedback);

  useEffect(() => {
    const feedbacksCollection = collection(db, 'feedbacks');
    const q = query(feedbacksCollection, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const feedbacks = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        } as Feedback));
        setServerFeedback(feedbacks);
        setIsLoading(false);
      },
      (error) => {
        console.error("Error fetching feedback: ", error);
        setIsLoading(false);
      }
    );

    // Cleanup subscription on component unmount
    return () => unsubscribe();
  }, []);

  const combinedFeedback = useMemo(() => {
    const serverIds = new Set(serverFeedback.map(f => f.id));
    // Filter out optimistic items that have been replaced by server data
    const filteredOptimistic = optimisticFeedback.filter(
        (of) => !serverFeedback.some(sf => sf.comment === of.comment && sf.rating === of.rating)
    );

    const allFeedback = [...filteredOptimistic, ...serverFeedback];

    // Sort the combined list
    allFeedback.sort((a, b) => {
      const dateA = isTimestamp(a.createdAt) ? a.createdAt.toDate() : a.createdAt;
      const dateB = isTimestamp(b.createdAt) ? b.createdAt.toDate() : b.createdAt;
      return dateB.getTime() - dateA.getTime();
    });

    return allFeedback;
  }, [serverFeedback, optimisticFeedback]);


  if (isLoading) {
    return (
        <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
            ))}
        </div>
    )
  }

  if (combinedFeedback.length === 0) {
    return <p className="text-center text-muted-foreground py-8">No feedback submitted yet.</p>;
  }

  return (
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[120px]">Rating</TableHead>
            <TableHead>Comment</TableHead>
            <TableHead className="w-[120px]">Status</TableHead>
            <TableHead className="w-[150px] text-right">Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {combinedFeedback.map((feedback) => (
            <TableRow key={feedback.id} className={feedback.id.startsWith('optimistic-') ? 'opacity-50' : ''}>
              <TableCell>
                <RatingStars rating={feedback.rating} />
              </TableCell>
              <TableCell className="font-medium">{feedback.comment || <span className="text-muted-foreground">No comment</span>}</TableCell>
              <TableCell>
                <StatusBadge status={feedback.status} />
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {feedback.createdAt ? formatDistanceToNow(isTimestamp(feedback.createdAt) ? feedback.createdAt.toDate() : feedback.createdAt, { addSuffix: true }) : '-'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
