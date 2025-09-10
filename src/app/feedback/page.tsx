
'use client';

import { FeedbackTable } from '@/components/feedback-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function FeedbackPage() {
  return (
    <div className="min-h-screen w-full bg-background text-foreground flex flex-col items-center p-4 sm:p-8">
      <div className="w-full max-w-4xl">
        <div className="mb-4">
          <Button asChild variant="ghost" size="sm" className="pl-0">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Translator
            </Link>
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Feedback Submissions</CardTitle>
            <CardDescription>
              This list displays all feedback submitted by users and updates in real-time.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FeedbackTable />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
