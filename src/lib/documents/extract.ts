import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Supported MIME types for document extraction.
 */
export const SUPPORTED_DOCUMENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type SupportedDocumentType = (typeof SUPPORTED_DOCUMENT_TYPES)[number];

/**
 * Result of extracting content from a document.
 * - PDFs produce `text`
 * - Images produce `base64Image` + `mimeType` (for multimodal LLM input)
 */
export interface ExtractedContent {
  type: 'text' | 'image';
  text?: string;
  base64Image?: string;
  mimeType: string;
  filename: string;
}

/**
 * Validates that a MIME type is supported for extraction.
 */
export function isSupportedMimeType(mimeType: string): mimeType is SupportedDocumentType {
  return (SUPPORTED_DOCUMENT_TYPES as readonly string[]).includes(mimeType);
}

/**
 * Extracts text from a PDF file buffer.
 * Uses pdf-parse if available, otherwise falls back to a basic text extraction
 * from the raw PDF binary (handles simple text-based PDFs).
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  // Try pdf-parse first (optional dependency)
  try {
    // Dynamic import so it doesn't fail at module load if not installed
    const pdfParse = (await import('pdf-parse')).default;
    const result = await pdfParse(buffer);
    return result.text;
  } catch {
    // pdf-parse not installed or failed — use basic fallback
    return extractPdfTextFallback(buffer);
  }
}

/**
 * Basic PDF text extraction fallback.
 * Extracts readable ASCII/UTF-8 text streams from raw PDF binary.
 * This handles simple text-based PDFs but won't work for scanned/image PDFs.
 */
export function extractPdfTextFallback(buffer: Buffer): string {
  const content = buffer.toString('latin1');

  const textChunks: string[] = [];

  // Strategy 1: Extract text between BT (Begin Text) and ET (End Text) operators
  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let match;
  while ((match = btEtRegex.exec(content)) !== null) {
    const block = match[1];
    // Extract text from Tj (show text) and TJ (show text array) operators
    const tjRegex = /\(([^)]*)\)\s*Tj/g;
    let tjMatch;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      const decoded = decodePdfString(tjMatch[1]);
      if (decoded.trim()) {
        textChunks.push(decoded);
      }
    }

    // TJ operator: array of strings and kerning values
    const tjArrayRegex = /\[((?:\([^)]*\)|[^])*?)\]\s*TJ/g;
    let tjArrMatch;
    while ((tjArrMatch = tjArrayRegex.exec(block)) !== null) {
      const arrContent = tjArrMatch[1];
      const strRegex = /\(([^)]*)\)/g;
      let strMatch;
      const parts: string[] = [];
      while ((strMatch = strRegex.exec(arrContent)) !== null) {
        parts.push(decodePdfString(strMatch[1]));
      }
      if (parts.length > 0) {
        textChunks.push(parts.join(''));
      }
    }
  }

  // Strategy 2: If BT/ET extraction yielded nothing, try stream objects
  if (textChunks.length === 0) {
    const streamRegex = /stream\r?\n([\s\S]*?)endstream/g;
    let streamMatch;
    while ((streamMatch = streamRegex.exec(content)) !== null) {
      const streamContent = streamMatch[1];
      // Only process if it looks like it contains text operators
      if (streamContent.includes('Tj') || streamContent.includes('TJ')) {
        const innerBtEt = /BT\s([\s\S]*?)ET/g;
        let innerMatch;
        while ((innerMatch = innerBtEt.exec(streamContent)) !== null) {
          const block = innerMatch[1];
          const tjRegex2 = /\(([^)]*)\)\s*Tj/g;
          let tj2;
          while ((tj2 = tjRegex2.exec(block)) !== null) {
            const decoded = decodePdfString(tj2[1]);
            if (decoded.trim()) {
              textChunks.push(decoded);
            }
          }
        }
      }
    }
  }

  const result = textChunks.join(' ').replace(/\s+/g, ' ').trim();
  return result;
}

/**
 * Decodes PDF escape sequences in a string literal.
 */
function decodePdfString(raw: string): string {
  return raw
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

/**
 * Reads an image file and returns its base64 encoding.
 */
async function extractImageBase64(buffer: Buffer): Promise<string> {
  return buffer.toString('base64');
}

/**
 * Extracts content from a document file.
 *
 * @param filePath - Absolute path to the file on disk
 * @param mimeType - MIME type of the file
 * @param filename - Original filename (for labeling in results)
 * @returns Extracted content (text for PDFs, base64 for images)
 * @throws Error if the file cannot be read or the MIME type is unsupported
 */
export async function extractDocumentContent(
  filePath: string,
  mimeType: string,
  filename: string,
): Promise<ExtractedContent> {
  if (!isSupportedMimeType(mimeType)) {
    throw new Error(`Unsupported document type: ${mimeType}`);
  }

  const buffer = await fs.readFile(filePath);

  if (mimeType === 'application/pdf') {
    const text = await extractPdfText(buffer);
    return {
      type: 'text',
      text,
      mimeType,
      filename,
    };
  }

  // Image types
  const base64Image = await extractImageBase64(buffer);
  return {
    type: 'image',
    base64Image,
    mimeType,
    filename,
  };
}

/**
 * Extracts content from a buffer directly (useful for testing or when file is already in memory).
 */
export async function extractDocumentContentFromBuffer(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<ExtractedContent> {
  if (!isSupportedMimeType(mimeType)) {
    throw new Error(`Unsupported document type: ${mimeType}`);
  }

  if (mimeType === 'application/pdf') {
    const text = await extractPdfText(buffer);
    return {
      type: 'text',
      text,
      mimeType,
      filename,
    };
  }

  const base64Image = await extractImageBase64(buffer);
  return {
    type: 'image',
    base64Image,
    mimeType,
    filename,
  };
}
