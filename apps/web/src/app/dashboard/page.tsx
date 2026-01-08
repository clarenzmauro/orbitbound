"use client";

import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { api } from "@orbitbound/backend/convex/_generated/api";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { Loader2, Rocket } from "lucide-react";
import Link from "next/link";

export default function Dashboard() {
  const user = useUser();
  const privateData = useQuery(api.privateData.get);

  return (
    <main className="min-h-screen bg-slate-950">
      <Authenticated>
        <div className="container mx-auto px-4 py-12">
          {/* Header */}
          <div className="flex items-center justify-between mb-12">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <Rocket className="w-6 h-6 text-emerald-500" />
              <span className="font-mono font-bold text-xl text-white">ORBITBOUND</span>
            </Link>
            <UserButton afterSignOutUrl="/" />
          </div>

          {/* Content */}
          <div className="max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold text-white font-mono mb-2">Dashboard</h1>
            <p className="text-slate-400 mb-8">Welcome back, {user.user?.firstName || user.user?.fullName}</p>

            {privateData?.message && (
              <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
                <p className="text-slate-300 font-mono text-sm">{privateData.message}</p>
              </div>
            )}
          </div>
        </div>
      </Authenticated>

      <Unauthenticated>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <Rocket className="w-16 h-16 text-emerald-500 mx-auto mb-6" />
            <h1 className="text-2xl font-bold text-white font-mono mb-4">Sign in to continue</h1>
            <SignInButton mode="modal">
              <button className="px-6 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors">
                Sign In
              </button>
            </SignInButton>
          </div>
        </div>
      </Unauthenticated>

      <AuthLoading>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
        </div>
      </AuthLoading>
    </main>
  );
}
