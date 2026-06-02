'use client';

import { useState, useCallback } from 'react';
import Image from 'next/image';
import { FileUpload } from '@/components/ui/FileUpload';
import { generateAvatarUrl } from '@/lib/avatars/dicebear';

interface PersonaAvatarUploadProps {
  personaId: string;
  personaName: string;
  currentAvatarUrl?: string | null;
  onAvatarChange: (url: string | null) => void;
}

export function PersonaAvatarUpload({
  personaId,
  personaName,
  currentAvatarUrl,
  onAvatarChange,
}: PersonaAvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dicebearUrl = generateAvatarUrl(personaName);
  const displayUrl = currentAvatarUrl || dicebearUrl;
  const isExternal = displayUrl.startsWith('http');

  const handleFileSelect = useCallback(async (file: File) => {
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload/image', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }

      const { url } = await response.json();

      // Update persona with new avatar URL
      const patchResponse = await fetch(`/api/personas/${personaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl: url }),
      });

      if (!patchResponse.ok) {
        const patchData = await patchResponse.json();
        throw new Error(patchData.error || 'Failed to update persona');
      }

      onAvatarChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [personaId, onAvatarChange]);

  const handleRemoveAvatar = useCallback(async () => {
    setUploading(true);
    setError(null);

    try {
      const response = await fetch(`/api/personas/${personaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl: null }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove avatar');
      }

      onAvatarChange(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove avatar');
    } finally {
      setUploading(false);
    }
  }, [personaId, onAvatarChange]);

  const handleUploadError = useCallback((errorMsg: string) => {
    setError(errorMsg);
  }, []);

  return (
    <div data-testid="persona-avatar-upload" className="space-y-4">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Avatar
      </label>

      {/* Current avatar preview */}
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-gray-200 dark:border-gray-700">
          <Image
            src={displayUrl}
            alt={`${personaName} avatar`}
            width={80}
            height={80}
            className="w-full h-full object-cover"
            unoptimized={isExternal}
            data-testid="avatar-preview"
          />
        </div>

        {currentAvatarUrl && (
          <button
            type="button"
            onClick={handleRemoveAvatar}
            disabled={uploading}
            className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
            data-testid="remove-avatar-button"
          >
            Remove custom avatar
          </button>
        )}
      </div>

      {/* Upload area */}
      <FileUpload
        onFileSelect={handleFileSelect}
        onError={handleUploadError}
        accept="image/jpeg,image/png,image/webp"
        maxSizeMB={2}
        preview={currentAvatarUrl}
        className={uploading ? 'opacity-50 pointer-events-none' : ''}
      />

      {uploading && (
        <p className="text-sm text-gray-500 dark:text-gray-400" data-testid="upload-status">
          Uploading...
        </p>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" data-testid="upload-error">
          {error}
        </p>
      )}

      {!currentAvatarUrl && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Using auto-generated avatar. Upload a custom image to override.
        </p>
      )}
    </div>
  );
}
