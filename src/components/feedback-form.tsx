
'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Star, X, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

type FeedbackFormProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function FeedbackForm({ isOpen, onClose }: FeedbackFormProps) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');

  const handleSubmit = () => {
    // Logic to submit feedback will be added later
    console.log({ rating, feedbackText });
    onClose(); // Close the form after submission
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="bg-muted text-card-foreground h-auto w-full rounded-t-2xl border-t p-4 shadow-lg sm:max-w-lg sm:mx-auto"
        onInteractOutside={onClose}
        hideCloseButton={true} // Hide the default close button
      >
        <div className="relative">
          <SheetTitle className="sr-only">Feedback Form</SheetTitle>

          {/* Custom Controls Container */}
          <div className="absolute top-0 right-0 flex items-center">
            {/* Custom Close Button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-blue-400"
              onClick={onClose}
            >
              <X size={20} />
              <span className="sr-only">Close</span>
            </Button>
            {/* Submit Button */}
            <Button onClick={handleSubmit} variant="ghost" size="icon" className="h-8 w-8 text-blue-400">
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
                        ? 'text-yellow-400 fill-yellow-400'
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
