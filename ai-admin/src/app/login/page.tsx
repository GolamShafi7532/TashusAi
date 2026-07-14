'use strict';
'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');

  const redirectPath = searchParams.get('from') || '/sessions';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const endpoint = mode === 'signup' ? '/api/admin/auth/signup' : '/api/admin/auth/login';
      const payload = mode === 'signup'
        ? { email, password, displayName }
        : { email, password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || (mode === 'signup' ? 'Unable to create account' : 'Invalid credentials'));
        setLoading(false);
        return;
      }

      router.push(redirectPath);
    } catch (err) {
      setError('Connection failed. Please check backend status.');
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090D11] text-[#E4E6EB] p-4">
      {/* Background Gradient Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-[#20B9BE] opacity-10 blur-[100px]" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-[#F2994A] opacity-10 blur-[100px]" />
      </div>

      <div className="w-full max-w-md bg-[#0F161E]/80 backdrop-blur-xl border border-[#1E293B] rounded-2xl p-8 shadow-2xl relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 bg-[#20B9BE]/10 rounded-2xl mb-4 border border-[#20B9BE]/20">
            <svg className="w-8 h-8 text-[#20B9BE]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Tashus AI Admin</h1>
          <p className="text-sm text-[#94A3B8] mt-1">Ecosystem command center</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm flex items-center gap-3">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <div className="mb-6 flex rounded-xl border border-[#1E293B] bg-[#090D11] p-1">
          <button
            type="button"
            onClick={() => { setMode('signin'); setError(''); }}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-all ${mode === 'signin' ? 'bg-[#20B9BE] text-white' : 'text-[#94A3B8] hover:text-white'}`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setError(''); }}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-all ${mode === 'signup' ? 'bg-[#20B9BE] text-white' : 'text-[#94A3B8] hover:text-white'}`}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-2" htmlFor="displayName">
                Display Name
              </label>
              <input
                id="displayName"
                type="text"
                required={mode === 'signup'}
                className="w-full bg-[#090D11] border border-[#1E293B] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#20B9BE] focus:ring-1 focus:ring-[#20B9BE] transition-all"
                placeholder="Alex Carter"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-2" htmlFor="email">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              required
              className="w-full bg-[#090D11] border border-[#1E293B] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#20B9BE] focus:ring-1 focus:ring-[#20B9BE] transition-all"
              placeholder="admin@tashus.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-[#94A3B8] uppercase tracking-wider" htmlFor="password">
                Password
              </label>
            </div>
            <input
              id="password"
              type="password"
              required
              className="w-full bg-[#090D11] border border-[#1E293B] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#20B9BE] focus:ring-1 focus:ring-[#20B9BE] transition-all"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#20B9BE] hover:bg-[#17878b] disabled:opacity-50 text-white rounded-xl py-3 text-sm font-semibold transition-all shadow-lg shadow-[#20B9BE]/10 hover:shadow-[#20B9BE]/20 mt-2 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>{mode === 'signup' ? 'Creating account...' : 'Authenticating...'}</span>
              </>
            ) : (
              <span>{mode === 'signup' ? 'Create Account' : 'Sign In'}</span>
            )}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen items-center justify-center bg-[#090D11]">
        <div className="animate-spin h-8 w-8 border-2 border-[#20B9BE] border-t-transparent rounded-full" />
      </main>
    }>
      <LoginContent />
    </Suspense>
  );
}
