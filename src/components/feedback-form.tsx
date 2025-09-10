
'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Star, X, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { submitFeedback } from '@/lib/feedback-service';
import { useFeedbackStore, OptimisticFeedback } from '@/lib/feedback-store';
import { toast } from 'sonner';
import { broadcastFeedback } from '@/lib/broadcast-channel';


type FeedbackFormProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function FeedbackForm({ isOpen, onClose }: FeedbackFormProps) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const addOptimisticFeedback = useFeedbackStore((state) => state.addOptimisticFeedback);

  const resetForm = () => {
    setRating(0);
    setFeedbackText('');
    setHoverRating(0);
    setIsSubmitting(false);
  }

  const handleClose = () => {
    resetForm();
    onClose();
  }

  const handleSubmit = async () => {
    if (rating === 0 || !feedbackText.trim()) {
        toast.error("Please provide a rating and a comment.");
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 820);
        return;
    }
    setIsSubmitting(true);

    const optimisticId = `optimistic-${Date.now()}`;
    const newFeedback: OptimisticFeedback = {
      id: optimisticId,
      rating,
      comment: feedbackText,
      createdAt: new Date(),
      status: 'new',
    };
    
    // 1. Optimistically update the current tab's UI
    addOptimisticFeedback(newFeedback);

    // 2. Broadcast the optimistic update to other tabs
    broadcastFeedback(newFeedback);

    handleClose(); // Close form immediately

    try {
        await submitFeedback({ rating, comment: feedbackText });
        // On success, the real-time listener will eventually replace the optimistic update.
        if (navigator.onLine) {
            toast.success("Thank you for your feedback!");
        } else {
             toast.info("You are offline", {
                description: "Your feedback has been saved and will be submitted when you're back online.",
            });
        }
    } catch (error) {
      // If submission fails, we need to remove the optimistic update.
      // This is a more advanced scenario that involves updating Zustand state.
      // For now, we log the error and notify the user.
      console.error("Failed to submit feedback:", error);
      toast.error("Failed to submit feedback", {
        description: "There was a problem submitting your feedback. Please try again later.",
      });
      // Here you would ideally remove the optimistic feedback item from the store.
      // useFeedbackStore.getState().removeOptimisticFeedback(optimisticId);
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent
        side="bottom"
        className="bg-muted text-card-foreground h-auto w-full rounded-t-2xl border-t p-4 shadow-lg sm:max-w-lg sm:mx-auto"
        onInteractOutside={handleClose}
        hideCloseButton={true} // Hide the default close button
      >
        <div
          className={cn(
            'relative',
            isShaking ? 'animate-shake' : ''
          )}
        >
          <SheetTitle className="sr-only">Feedback Form</SheetTitle>

          {/* Custom Controls Container */}
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between">
            {/* Custom Close Button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-blue-400"
              onClick={handleClose}
            >
              <X size={20} />
              <span className="sr-only">Close</span>
            </Button>
            {/* Submit Button */}
            <Button onClick={handleSubmit} variant="ghost" size="icon" className="h-8 w-8 text-blue-400" disabled={isSubmitting}>
              <Send size={20}/>
            </Button>
          </div>


          <div className="flex flex-col space-y-4 pt-8">
            {/* Star Rating */}
            <div className="flex justify-center space-x-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="focus:outline-none"
                >
                  <Star
                    className={cn(
                      'h-8 w-8 transition-colors',
                      star <= (hoverRating || rating)
                        ? 'text-blue-400 fill-blue-400'
                        : 'text-muted-foreground'
                    )}
                  />
                </button>
              ))}
            </div>

            {/* Feedback Textarea */}
            <Textarea
              placeholder="Provide additional feedback..."
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              className="min-h-[100px] bg-background"
            />

          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
