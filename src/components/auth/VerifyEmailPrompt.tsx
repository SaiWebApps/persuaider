'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

interface VerifyEmailPromptProps {
  email?: string | null;
}

export function VerifyEmailPrompt({ email }: VerifyEmailPromptProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  async function handleResend() {
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to send verification email.');
      } else {
        setSuccess(data.message || 'Verification email sent!');
      }
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
            Check your email
          </p>
        </div>

        <div className="space-y-4">
          <div className="rounded-md bg-blue-50 dark:bg-blue-900/30 p-4">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              We sent a verification link to{' '}
              {email ? (
                <span className="font-medium">{email}</span>
              ) : (
                'your email'
              )}
              . Please check your inbox and click the link to verify your account.
            </p>
          </div>

          {success && (
            <div className="rounded-md bg-green-50 dark:bg-green-900/30 p-4">
              <p className="text-sm text-green-800 dark:text-green-300">{success}</p>
            </div>
          )}

          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/30 p-4">
              <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
            </div>
          )}

          <button
            onClick={handleResend}
            disabled={loading}
            className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Sending...' : 'Resend verification email'}
          </button>

          <p className="text-center text-sm text-gray-600 dark:text-gray-400">
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-indigo-600 hover:text-indigo-500 font-medium"
            >
              Sign out
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
