import * as React from 'react';
import { cn } from '@/lib/utils';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, onChange, ...props }, ref) => {
    const internalRef = React.useRef<HTMLTextAreaElement>(null);
    React.useImperativeHandle(ref, () => internalRef.current!);

    const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (internalRef.current) {
        internalRef.current.style.height = 'auto'; // Reset height
        internalRef.current.style.height = `${internalRef.current.scrollHeight}px`;
      }
      if (onChange) {
        onChange(event);
      }
    };

    React.useLayoutEffect(() => {
        if(internalRef.current) {
            internalRef.current.style.height = 'auto';
            internalRef.current.style.height = `${internalRef.current.scrollHeight}px`;
        }
    }, [props.value]);


    return (
      <textarea
        className={cn(
          'flex w-full rounded-md border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          'min-h-[40px] overflow-hidden transition-[height] duration-200 ease-in-out', // Added for auto-sizing and animation
          className
        )}
        ref={internalRef}
        onChange={handleInput}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export { Textarea };
