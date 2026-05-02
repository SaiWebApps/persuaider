'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (res.status === 400) {
        const data = await res.json();
        setError(data.error || 'Please enter a valid email address.');
        setLoading(false);
        return;
      }

      setSubmitted(true);
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-lg shadow-md">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-gray-100">
            Persuaider
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Reset your password
          </p>
        </div>

        {submitted ? (
          <div className="space-y-4">
            <div className="rounded-md bg-green-50 dark:bg-green-900/30 p-4">
              <p className="text-sm text-green-800 dark:text-green-300">
                If an account exists with that email, a reset link has been sent.
              </p>
            </div>
            <p className="text-center text-sm text-gray-600 dark:text-gray-400">
              <Link href="/login" className="text-indigo-600 hover:text-indigo-500 font-medium">
                Back to login
              </Link>
            </p>
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-md bg-red-50 dark:bg-red-900/30 p-4">
                <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
              </div>
            )}

            <div>
              <label htmlFor="email" className="sr-only">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-gray-100 dark:bg-gray-700 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
                disabled={loading}
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Sending...' : 'Send reset link'}
              </button>
            </div>

            <p className="text-center text-sm text-gray-600 dark:text-gray-400">
              <Link href="/login" className="text-indigo-600 hover:text-indigo-500 font-medium">
                Back to login
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
