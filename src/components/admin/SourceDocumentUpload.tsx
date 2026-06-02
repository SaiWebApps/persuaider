'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/Button';

interface SourceFileInfo {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

interface Props {
  scenarioId?: string;
  files: SourceFileInfo[];
  onUpload: (file: File) => Promise<void>;
  onDelete: (fileId: string) => Promise<void>;
}

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export function SourceDocumentUpload({ files, onUpload, onDelete }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(`Unsupported file type. Allowed: PDF, JPEG, PNG, WebP`);
      return;
    }

    if (file.size > MAX_SIZE) {
      setError('File too large. Maximum size: 10MB');
      return;
    }

    setUploading(true);
    try {
      await onUpload(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    if (inputRef.current) inputRef.current.value = '';
  }, [handleFile]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getMimeIcon = (mimeType: string) => {
    if (mimeType === 'application/pdf') return 'PDF';
    if (mimeType.startsWith('image/')) return 'IMG';
    return 'FILE';
  };

  return (
    <div data-testid="source-document-upload" className="space-y-4">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
        Source Documents
      </h4>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        onChange={handleInputChange}
        className="hidden"
        data-testid="file-input"
      />

      <div
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
        } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
        data-testid="upload-dropzone"
      >
        <div className="text-gray-500 dark:text-gray-400">
          <p className="text-sm">
            {uploading ? 'Uploading...' : (
              <>
                <span className="text-indigo-600 dark:text-indigo-400 font-medium">Click to upload</span>
                {' '}or drag and drop
              </>
            )}
          </p>
          <p className="text-xs mt-1">PDF, JPEG, PNG, WebP up to 10MB</p>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400" data-testid="upload-error">
          {error}
        </p>
      )}

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
              data-testid={`file-item-${f.id}`}
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded bg-gray-200 dark:bg-gray-700 text-xs font-bold text-gray-600 dark:text-gray-300">
                  {getMimeIcon(f.mimeType)}
                </span>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate max-w-[200px]">
                    {f.filename}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatSize(f.sizeBytes)}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(f.id)}
                data-testid={`delete-file-${f.id}`}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

