
'use client';

import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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
  const [feedbackList, setFeedbackList] = useState<Feedback[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const feedbackCollection = collection(db, 'feedback');
    const q = query(feedbackCollection, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const feedbacks = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        } as Feedback));
        setFeedbackList(feedbacks);
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

  if (isLoading) {
    return (
        <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
            ))}
        </div>
    )
  }

  if (feedbackList.length === 0) {
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
          {feedbackList.map((feedback) => (
            <TableRow key={feedback.id}>
              <TableCell>
                <RatingStars rating={feedback.rating} />
              </TableCell>
              <TableCell className="font-medium">{feedback.comment || <span className="text-muted-foreground">No comment</span>}</TableCell>
              <TableCell>
                <StatusBadge status={feedback.status} />
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {feedback.createdAt ? formatDistanceToNow(feedback.createdAt.toDate(), { addSuffix: true }) : '-'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
