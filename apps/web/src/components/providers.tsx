"use client";

import { useAuth } from "@clerk/nextjs";
import { env } from "@orbitbound/env/web";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";

import { ThemeProvider } from "./theme-provider";
import { Toaster } from "./ui/sonner";

const convex = new ConvexReactClient(env.NEXT_PUBLIC_CONVEX_URL);

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
      <Toaster 
        richColors 
        position="top-center" 
        toastOptions={{
          duration: 3000,
          style: {
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(51, 65, 85, 0.5)',
            color: '#e2e8f0',
          },
        }}
      />
    </ThemeProvider>
  );
}
