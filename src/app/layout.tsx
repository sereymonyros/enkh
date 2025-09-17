
'use client';

import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { useAuth } from "@/hooks/use-auth";
import { LoaderCircle } from "lucide-react";


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  // The metadata is still here for static analysis, but the main layout is now a client component.
  // const metadata: Metadata = {
  //   title: "enkh",
  //   description: "Translate text between English and Khmer",
  // };

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=PT+Sans:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
