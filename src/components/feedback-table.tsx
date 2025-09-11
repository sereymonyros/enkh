
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Timestamp } from 'firebase/firestore';
import { useFeedbackStore, OptimisticFeedback } from '@/lib/feedback-store';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Star } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { addFeedbackListener } from '@/lib/broadcast-channel';
import { cn } from '@/lib/utils';


type Feedback = {
  id: string;
  rating: number;
  comment: string;
  createdAt: Date | Timestamp | null;
  status: 'new' | 'viewed' | 'in-progress' | 'fixed';
};

// A type guard to check if an object is a Firestore Timestamp
function isTimestamp(date: any): date is Timestamp {
  return date && typeof date.toDate === 'function';
}


const StatusBadge = ({ status, className }: { status: Feedback['status'], className?: string }) => {
  const variant = {
    new: 'destructive',
    viewed: 'secondary',
    'in-progress': 'default',
    fixed: 'default', 
  }[status] as 'default' | 'secondary' | 'outline' | 'destructive' | undefined;

  return (
    <Badge
      variant={variant}
      className={cn(
        className,
        status === 'fixed' && 'bg-blue-400 text-primary-foreground',
        status === 'new' && 'bg-destructive text-destructive-foreground'
      )}
    >
      {status}
    </Badge>
  );
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

const renderDate = (createdAt: Date | Timestamp | null) => {
    if (!createdAt) return '-';
    const date = isTimestamp(createdAt) ? createdAt.toDate() : createdAt;
    return formatDistanceToNow(date, { addSuffix: true });
}

export function FeedbackTable() {
  const { serverFeedback, optimisticFeedback, addOptimisticFeedback } = useFeedbackStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // If server feedback is already loaded from the store, we are not loading.
    if (serverFeedback.length > 0) {
        setIsLoading(false);
    }
    // Listen for optimistic updates from other tabs
    const unsubscribeChannel = addFeedbackListener((newFeedback) => {
        // When a message is received, add it to this tab's zustand store
        addOptimisticFeedback(newFeedback);
    });

    // Cleanup subscription on component unmount
    return () => {
        unsubscribeChannel();
    };
  }, [addOptimisticFeedback, serverFeedback]);

  const combinedFeedback: Feedback[] = useMemo(() => {
    // Filter out optimistic items that have been replaced by server data
    const filteredOptimistic = optimisticFeedback.filter(
        // An optimistic item is kept if there's no server item with the same comment and rating.
        // This is a simple way to deduplicate. A more robust way would be to use the optimistic ID.
        (of) => !serverFeedback.some(sf => sf.comment === of.comment && sf.rating === of.rating)
    );

    const allFeedback: Feedback[] = [...filteredOptimistic, ...serverFeedback];

    // Sort the combined list by date, handling potential nulls
    allFeedback.sort((a, b) => {
      const dateA = a.createdAt ? (isTimestamp(a.createdAt) ? a.createdAt.toDate() : a.createdAt) : null;
      const dateB = b.createdAt ? (isTimestamp(b.createdAt) ? b.createdAt.toDate() : b.createdAt) : null;
      
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;

      return dateB.getTime() - dateA.getTime();
    });
    
    if (allFeedback.length > 0 && isLoading) {
        setIsLoading(false);
    }

    return allFeedback;
  }, [serverFeedback, optimisticFeedback, isLoading]);


  if (isLoading) {
    return (
        <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
            ))}
        </div>
    )
  }

  if (combinedFeedback.length === 0) {
    return <p className="text-center text-muted-foreground py-8">No feedback submitted yet.</p>;
  }

  return (
    <>
      {/* Mobile View: Card Layout */}
      <div className="md:hidden space-y-4">
        {combinedFeedback.map((feedback) => (
            <Card key={feedback.id} className={`relative overflow-hidden ${feedback.id.startsWith('optimistic-') ? 'opacity-50' : ''}`}>
                <CardHeader className="p-4 flex flex-row items-center justify-between">
                    <div className="space-y-2 flex-1 pr-12">
                        <RatingStars rating={feedback.rating} />
                        <p className="font-medium">{feedback.comment || <span className="text-muted-foreground">No comment</span>}</p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground space-y-1">
                       { (feedback.status !== 'fixed' && feedback.status !== 'new') && (
                        <>
                           <div>{renderDate(feedback.createdAt)}</div>
                           <StatusBadge status={feedback.status} />
                        </>
                       )}
                    </div>
                </CardHeader>
                 {(feedback.status === 'fixed' || feedback.status === 'new') && (
                  <StatusBadge status={feedback.status} className="absolute top-0 right-0 rounded-none rounded-bl-lg" />
                )}
            </Card>
        ))}
      </div>

      {/* Desktop View: Table Layout */}
      <div className="hidden md:block border rounded-md">
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
              <TableRow key={feedback.id} className={`relative ${feedback.id.startsWith('optimistic-') ? 'opacity-50' : ''}`}>
                <TableCell>
                  <RatingStars rating={feedback.rating} />
                </TableCell>
                <TableCell className="font-medium">{feedback.comment || <span className="text-muted-foreground">No comment</span>}</TableCell>
                <TableCell>
                    {(feedback.status !== 'fixed' && feedback.status !== 'new') && <StatusBadge status={feedback.status} />}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                   {(feedback.status !== 'fixed' && feedback.status !== 'new') && renderDate(feedback.createdAt)}
                   {(feedback.status === 'fixed' || feedback.status === 'new') && (
                     <StatusBadge status={feedback.status} className="absolute top-0 right-0 rounded-none rounded-bl-lg" />
                   )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
