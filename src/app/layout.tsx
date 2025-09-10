
import type { Metadata } from "next";
import "./globals.css";
import { Toaster as SonnerToaster } from 'sonner';
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "enkh",
  description: "Translate text between English and Khmer",
};

export default function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: { locale: string };
}>) {
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
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          disableTransitionOnChange
        >
          {children}
          <SonnerToaster richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
