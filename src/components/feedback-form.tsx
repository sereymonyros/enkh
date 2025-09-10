
'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Star, X, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { submitFeedback } from '@/lib/feedback-service';
import { toast } from 'sonner';


type FeedbackFormProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function FeedbackForm({ isOpen, onClose }: FeedbackFormProps) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    if (rating === 0 && !feedbackText.trim()) {
        toast.error("Please provide a rating or a comment.");
        return;
    }
    setIsSubmitting(true);
    try {
        await submitFeedback({ rating, comment: feedbackText });
        toast.success("Thank you for your feedback!");
        handleClose();
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error("An unknown error occurred.");
      }
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
        <div className="relative">
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
