/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { SourceDocumentUpload } from '@/components/admin/SourceDocumentUpload';

// A controllable deferred promise so we can assert on the in-flight "uploading" state.
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeFile(name: string, type: string, sizeBytes: number): File {
  const file = new File(['x'], name, { type });
  // File.size is read-only; override it so we can exercise the size-limit branch.
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

const SAMPLE_FILES = [
  {
    id: 'f1',
    filename: 'contract.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 2048,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'f2',
    filename: 'diagram.png',
    mimeType: 'image/png',
    sizeBytes: 500,
    createdAt: '2026-01-02T00:00:00.000Z',
  },
];

describe('SourceDocumentUpload', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the dropzone and heading', () => {
    render(
      <SourceDocumentUpload files={[]} onUpload={jest.fn()} onDelete={jest.fn()} />
    );

    expect(screen.getByTestId('source-document-upload')).toBeInTheDocument();
    expect(screen.getByTestId('upload-dropzone')).toBeInTheDocument();
    expect(screen.getByTestId('file-input')).toBeInTheDocument();
    expect(screen.getByText('Source Documents')).toBeInTheDocument();
    expect(screen.getByText(/Click to upload/)).toBeInTheDocument();
  });

  it('does not render the file list when files is empty', () => {
    render(
      <SourceDocumentUpload files={[]} onUpload={jest.fn()} onDelete={jest.fn()} />
    );

    expect(screen.queryByTestId('file-item-f1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('upload-error')).not.toBeInTheDocument();
  });

  it('renders each existing source file with name, size and delete button', () => {
    render(
      <SourceDocumentUpload files={SAMPLE_FILES} onUpload={jest.fn()} onDelete={jest.fn()} />
    );

    expect(screen.getByTestId('file-item-f1')).toBeInTheDocument();
    expect(screen.getByTestId('file-item-f2')).toBeInTheDocument();
    expect(screen.getByText('contract.pdf')).toBeInTheDocument();
    expect(screen.getByText('diagram.png')).toBeInTheDocument();
    // formatSize: 2048 bytes -> "2.0 KB", 500 bytes -> "500 B"
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
    expect(screen.getByText('500 B')).toBeInTheDocument();
    // mime icons
    expect(screen.getByText('PDF')).toBeInTheDocument();
    expect(screen.getByText('IMG')).toBeInTheDocument();
    expect(screen.getByTestId('delete-file-f1')).toBeInTheDocument();
    expect(screen.getByTestId('delete-file-f2')).toBeInTheDocument();
  });

  it('calls onUpload with the selected file for a supported type', async () => {
    const onUpload = jest.fn().mockResolvedValue(undefined);
    render(
      <SourceDocumentUpload files={[]} onUpload={onUpload} onDelete={jest.fn()} />
    );

    const input = screen.getByTestId('file-input');
    const file = makeFile('doc.pdf', 'application/pdf', 1024);
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(onUpload).toHaveBeenCalledTimes(1);
    });
    expect(onUpload).toHaveBeenCalledWith(file);
    // No error should be shown on a successful upload.
    expect(screen.queryByTestId('upload-error')).not.toBeInTheDocument();
  });

  it('shows the uploading state while onUpload is in flight, then clears it', async () => {
    const d = deferred<void>();
    const onUpload = jest.fn().mockReturnValue(d.promise);
    render(
      <SourceDocumentUpload files={[]} onUpload={onUpload} onDelete={jest.fn()} />
    );

    const input = screen.getByTestId('file-input');
    fireEvent.change(input, {
      target: { files: [makeFile('doc.pdf', 'application/pdf', 1024)] },
    });

    // While the upload promise is unresolved we should see the "Uploading..." label
    // and the dropzone should be disabled via pointer-events-none.
    await waitFor(() => {
      expect(screen.getByText('Uploading...')).toBeInTheDocument();
    });
    expect(screen.getByTestId('upload-dropzone').className).toContain('pointer-events-none');
    expect(screen.queryByText(/Click to upload/)).not.toBeInTheDocument();

    // Resolve the upload.
    d.resolve();

    await waitFor(() => {
      expect(screen.queryByText('Uploading...')).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Click to upload/)).toBeInTheDocument();
    expect(screen.getByTestId('upload-dropzone').className).not.toContain('pointer-events-none');
  });

  it('shows an error message when onUpload rejects with an Error', async () => {
    const onUpload = jest.fn().mockRejectedValue(new Error('Server exploded'));
    render(
      <SourceDocumentUpload files={[]} onUpload={onUpload} onDelete={jest.fn()} />
    );

    fireEvent.change(screen.getByTestId('file-input'), {
      target: { files: [makeFile('doc.pdf', 'application/pdf', 1024)] },
    });

    await waitFor(() => {
      expect(screen.getByTestId('upload-error')).toHaveTextContent('Server exploded');
    });
    // uploading state must be cleared after failure (finally block).
    expect(screen.queryByText('Uploading...')).not.toBeInTheDocument();
  });

  it('falls back to a generic message when onUpload rejects with a non-Error', async () => {
    const onUpload = jest.fn().mockRejectedValue('boom');
    render(
      <SourceDocumentUpload files={[]} onUpload={onUpload} onDelete={jest.fn()} />
    );

    fireEvent.change(screen.getByTestId('file-input'), {
      target: { files: [makeFile('doc.pdf', 'application/pdf', 1024)] },
    });

    await waitFor(() => {
      expect(screen.getByTestId('upload-error')).toHaveTextContent('Upload failed');
    });
  });

  it('rejects an unsupported file type and does not call onUpload', async () => {
    const onUpload = jest.fn().mockResolvedValue(undefined);
    render(
      <SourceDocumentUpload files={[]} onUpload={onUpload} onDelete={jest.fn()} />
    );

    fireEvent.change(screen.getByTestId('file-input'), {
      target: { files: [makeFile('notes.txt', 'text/plain', 100)] },
    });

    await waitFor(() => {
      expect(screen.getByTestId('upload-error')).toHaveTextContent(/Unsupported file type/);
    });
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('rejects a file that exceeds the 10MB limit and does not call onUpload', async () => {
    const onUpload = jest.fn().mockResolvedValue(undefined);
    render(
      <SourceDocumentUpload files={[]} onUpload={onUpload} onDelete={jest.fn()} />
    );

    const tooBig = makeFile('huge.pdf', 'application/pdf', 11 * 1024 * 1024);
    fireEvent.change(screen.getByTestId('file-input'), {
      target: { files: [tooBig] },
    });

    await waitFor(() => {
      expect(screen.getByTestId('upload-error')).toHaveTextContent(/File too large/);
    });
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('clears a previous error after a subsequent valid upload starts', async () => {
    const onUpload = jest.fn().mockResolvedValue(undefined);
    render(
      <SourceDocumentUpload files={[]} onUpload={onUpload} onDelete={jest.fn()} />
    );

    const input = screen.getByTestId('file-input');

    // First, an invalid file produces an error.
    fireEvent.change(input, {
      target: { files: [makeFile('notes.txt', 'text/plain', 100)] },
    });
    await waitFor(() => {
      expect(screen.getByTestId('upload-error')).toBeInTheDocument();
    });

    // Then a valid file should clear the error (setError(null) at the start of handleFile).
    fireEvent.change(input, {
      target: { files: [makeFile('doc.pdf', 'application/pdf', 1024)] },
    });
    await waitFor(() => {
      expect(onUpload).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByTestId('upload-error')).not.toBeInTheDocument();
  });

  it('does nothing when the file input change has no file', () => {
    const onUpload = jest.fn();
    render(
      <SourceDocumentUpload files={[]} onUpload={onUpload} onDelete={jest.fn()} />
    );

    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [] } });
    expect(onUpload).not.toHaveBeenCalled();
    expect(screen.queryByTestId('upload-error')).not.toBeInTheDocument();
  });

  it('handles a dropped supported file by calling onUpload', async () => {
    const onUpload = jest.fn().mockResolvedValue(undefined);
    render(
      <SourceDocumentUpload files={[]} onUpload={onUpload} onDelete={jest.fn()} />
    );

    const dropzone = screen.getByTestId('upload-dropzone');
    const file = makeFile('dropped.png', 'image/png', 2048);
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    await waitFor(() => {
      expect(onUpload).toHaveBeenCalledWith(file);
    });
  });

  it('ignores a drop event with no files', () => {
    const onUpload = jest.fn();
    render(
      <SourceDocumentUpload files={[]} onUpload={onUpload} onDelete={jest.fn()} />
    );

    fireEvent.drop(screen.getByTestId('upload-dropzone'), {
      dataTransfer: { files: [] },
    });
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('applies dragging styles on dragOver and removes them on dragLeave', () => {
    render(
      <SourceDocumentUpload files={[]} onUpload={jest.fn()} onDelete={jest.fn()} />
    );

    const dropzone = screen.getByTestId('upload-dropzone');

    fireEvent.dragOver(dropzone);
    expect(dropzone.className).toContain('border-indigo-500');

    fireEvent.dragLeave(dropzone);
    expect(dropzone.className).not.toContain('border-indigo-500');
  });

  it('opens the file dialog when the dropzone is clicked', () => {
    render(
      <SourceDocumentUpload files={[]} onUpload={jest.fn()} onDelete={jest.fn()} />
    );

    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const clickSpy = jest.spyOn(input, 'click').mockImplementation(() => {});

    fireEvent.click(screen.getByTestId('upload-dropzone'));
    expect(clickSpy).toHaveBeenCalledTimes(1);

    clickSpy.mockRestore();
  });

  it('calls onDelete with the file id when a Remove button is clicked', () => {
    const onDelete = jest.fn().mockResolvedValue(undefined);
    render(
      <SourceDocumentUpload files={SAMPLE_FILES} onUpload={jest.fn()} onDelete={onDelete} />
    );

    fireEvent.click(screen.getByTestId('delete-file-f1'));
    expect(onDelete).toHaveBeenCalledWith('f1');

    fireEvent.click(screen.getByTestId('delete-file-f2'));
    expect(onDelete).toHaveBeenCalledWith('f2');
  });

  it('formats megabyte-scale file sizes with the MB suffix', () => {
    render(
      <SourceDocumentUpload
        files={[
          {
            id: 'big',
            filename: 'big.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 3 * 1024 * 1024,
            createdAt: '2026-01-03T00:00:00.000Z',
          },
        ]}
        onUpload={jest.fn()}
        onDelete={jest.fn()}
      />
    );

    expect(screen.getByText('3.0 MB')).toBeInTheDocument();
  });
});
