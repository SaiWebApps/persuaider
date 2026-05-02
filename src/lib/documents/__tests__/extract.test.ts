/**
 * @jest-environment node
 */

/**
 * Tests for the document extraction utility.
 * Covers PDF text extraction (fallback parser), image base64 encoding,
 * MIME type validation, and error handling.
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  extractDocumentContent,
  extractDocumentContentFromBuffer,
  extractPdfTextFallback,
  isSupportedMimeType,
  SUPPORTED_DOCUMENT_TYPES,
} from '../extract';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

// Helper: create a minimal valid PDF with text content
function createTestPdf(text: string): Buffer {
  // Minimal PDF 1.4 with a single page containing text
  const content = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj

2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj

3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj

4 0 obj
<< /Length ${42 + text.length} >>
stream
BT
/F1 12 Tf
100 700 Td
(${text}) Tj
ET
endstream
endobj

5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj

xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000266 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
0
%%EOF`;

  return Buffer.from(content, 'latin1');
}

// Helper: create a minimal PNG image (1x1 red pixel)
function createTestPng(): Buffer {
  // Minimal valid PNG: 1x1 pixel, red
  const png = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108020000009001' +
      '2e00000000c4944415478016360f8cf0000000200017348611c0000000049454e44ae426082',
    'hex',
  );
  return png;
}

// Helper: create a minimal JPEG image
function createTestJpeg(): Buffer {
  // Minimal valid JPEG: SOI + APP0 + minimal content + EOI
  return Buffer.from(
    'ffd8ffe000104a46494600010100000100010000ffdb004300080606070605' +
      '0807070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e' +
      '2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc00011' +
      '080001000103012200021101031101ffc4001500010100000000000000000000' +
      '00000000000affc40014100100000000000000000000000000000000ffda000c' +
      '03010002110311003f00540002ffd9',
    'hex',
  );
}

beforeAll(async () => {
  await fs.mkdir(FIXTURES_DIR, { recursive: true });
});

afterAll(async () => {
  // Clean up fixture files
  try {
    const files = await fs.readdir(FIXTURES_DIR);
    for (const file of files) {
      await fs.unlink(path.join(FIXTURES_DIR, file));
    }
    await fs.rmdir(FIXTURES_DIR);
  } catch {
    // ignore cleanup errors
  }
});

describe('isSupportedMimeType', () => {
  it('accepts application/pdf', () => {
    expect(isSupportedMimeType('application/pdf')).toBe(true);
  });

  it('accepts image/jpeg', () => {
    expect(isSupportedMimeType('image/jpeg')).toBe(true);
  });

  it('accepts image/png', () => {
    expect(isSupportedMimeType('image/png')).toBe(true);
  });

  it('accepts image/webp', () => {
    expect(isSupportedMimeType('image/webp')).toBe(true);
  });

  it('rejects unsupported types', () => {
    expect(isSupportedMimeType('text/plain')).toBe(false);
    expect(isSupportedMimeType('application/json')).toBe(false);
    expect(isSupportedMimeType('video/mp4')).toBe(false);
    expect(isSupportedMimeType('')).toBe(false);
  });
});

describe('SUPPORTED_DOCUMENT_TYPES', () => {
  it('contains exactly 4 types', () => {
    expect(SUPPORTED_DOCUMENT_TYPES).toHaveLength(4);
  });

  it('contains all expected types', () => {
    expect(SUPPORTED_DOCUMENT_TYPES).toContain('application/pdf');
    expect(SUPPORTED_DOCUMENT_TYPES).toContain('image/jpeg');
    expect(SUPPORTED_DOCUMENT_TYPES).toContain('image/png');
    expect(SUPPORTED_DOCUMENT_TYPES).toContain('image/webp');
  });
});

describe('extractPdfTextFallback', () => {
  it('extracts text from a simple PDF with Tj operator', () => {
    const pdf = createTestPdf('Hello World');
    const text = extractPdfTextFallback(pdf);
    expect(text).toContain('Hello World');
  });

  it('extracts text with special characters', () => {
    const pdf = createTestPdf('Price: $100');
    const text = extractPdfTextFallback(pdf);
    expect(text).toContain('Price: $100');
  });

  it('handles PDF escape sequences', () => {
    const pdf = createTestPdf('Line1\\nLine2');
    const text = extractPdfTextFallback(pdf);
    expect(text).toContain('Line1');
    expect(text).toContain('Line2');
  });

  it('returns empty string for non-PDF content', () => {
    const buffer = Buffer.from('This is not a PDF');
    const text = extractPdfTextFallback(buffer);
    expect(text).toBe('');
  });

  it('returns empty string for empty buffer', () => {
    const text = extractPdfTextFallback(Buffer.alloc(0));
    expect(text).toBe('');
  });

  it('handles PDF with TJ array operator', () => {
    // PDF with TJ operator (text array with kerning)
    const content = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
3 0 obj
<< /Length 80 >>
stream
BT
/F1 12 Tf
100 700 Td
[(Nego) 20 (tiation) -15 ( Case)] TJ
ET
endstream
endobj
%%EOF`;
    const buffer = Buffer.from(content, 'latin1');
    const text = extractPdfTextFallback(buffer);
    expect(text).toContain('Nego');
    expect(text).toContain('tiation');
    expect(text).toContain('Case');
  });
});

describe('extractDocumentContentFromBuffer', () => {
  it('extracts text from a PDF buffer', async () => {
    const pdf = createTestPdf('Salary Negotiation Case Study');
    const result = await extractDocumentContentFromBuffer(pdf, 'application/pdf', 'case.pdf');

    expect(result.type).toBe('text');
    expect(result.text).toContain('Salary Negotiation Case Study');
    expect(result.mimeType).toBe('application/pdf');
    expect(result.filename).toBe('case.pdf');
    expect(result.base64Image).toBeUndefined();
  });

  it('extracts base64 from a PNG buffer', async () => {
    const png = createTestPng();
    const result = await extractDocumentContentFromBuffer(png, 'image/png', 'board.png');

    expect(result.type).toBe('image');
    expect(result.base64Image).toBeDefined();
    expect(result.base64Image!.length).toBeGreaterThan(0);
    // Verify it's valid base64 by round-tripping
    const roundTripped = Buffer.from(result.base64Image!, 'base64');
    expect(roundTripped).toEqual(png);
    expect(result.mimeType).toBe('image/png');
    expect(result.filename).toBe('board.png');
    expect(result.text).toBeUndefined();
  });

  it('extracts base64 from a JPEG buffer', async () => {
    const jpeg = createTestJpeg();
    const result = await extractDocumentContentFromBuffer(jpeg, 'image/jpeg', 'photo.jpg');

    expect(result.type).toBe('image');
    expect(result.base64Image).toBeDefined();
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.filename).toBe('photo.jpg');
  });

  it('extracts base64 from a WebP buffer', async () => {
    // Use a simple buffer to represent webp (content doesn't matter for base64 encoding)
    const webp = Buffer.from('RIFF\x00\x00\x00\x00WEBP', 'ascii');
    const result = await extractDocumentContentFromBuffer(webp, 'image/webp', 'image.webp');

    expect(result.type).toBe('image');
    expect(result.base64Image).toBeDefined();
    expect(result.mimeType).toBe('image/webp');
  });

  it('throws for unsupported MIME type', async () => {
    const buffer = Buffer.from('test');
    await expect(
      extractDocumentContentFromBuffer(buffer, 'text/plain', 'file.txt'),
    ).rejects.toThrow('Unsupported document type: text/plain');
  });

  it('throws for empty MIME type', async () => {
    const buffer = Buffer.from('test');
    await expect(extractDocumentContentFromBuffer(buffer, '', 'file')).rejects.toThrow(
      'Unsupported document type:',
    );
  });
});

describe('extractDocumentContent (file-based)', () => {
  it('extracts text from a PDF file on disk', async () => {
    const pdf = createTestPdf('Board Meeting Notes');
    const filePath = path.join(FIXTURES_DIR, 'test.pdf');
    await fs.writeFile(filePath, pdf);

    const result = await extractDocumentContent(filePath, 'application/pdf', 'test.pdf');

    expect(result.type).toBe('text');
    expect(result.text).toContain('Board Meeting Notes');
    expect(result.mimeType).toBe('application/pdf');
  });

  it('extracts base64 from an image file on disk', async () => {
    const png = createTestPng();
    const filePath = path.join(FIXTURES_DIR, 'test.png');
    await fs.writeFile(filePath, png);

    const result = await extractDocumentContent(filePath, 'image/png', 'test.png');

    expect(result.type).toBe('image');
    expect(result.base64Image).toBeDefined();
    expect(result.mimeType).toBe('image/png');
  });

  it('throws when file does not exist', async () => {
    await expect(
      extractDocumentContent('/nonexistent/file.pdf', 'application/pdf', 'nope.pdf'),
    ).rejects.toThrow();
  });

  it('throws for unsupported MIME type even if file exists', async () => {
    const filePath = path.join(FIXTURES_DIR, 'test.txt');
    await fs.writeFile(filePath, 'hello');

    await expect(
      extractDocumentContent(filePath, 'text/plain', 'test.txt'),
    ).rejects.toThrow('Unsupported document type: text/plain');
  });
});

describe('integration: multiple document extraction', () => {
  it('processes a mix of PDFs and images', async () => {
    const documents = [
      { buffer: createTestPdf('Role A: Buyer'), mimeType: 'application/pdf' as const, filename: 'case.pdf' },
      { buffer: createTestPng(), mimeType: 'image/png' as const, filename: 'miro1.png' },
      { buffer: createTestPdf('Role B: Seller'), mimeType: 'application/pdf' as const, filename: 'notes.pdf' },
      { buffer: createTestJpeg(), mimeType: 'image/jpeg' as const, filename: 'miro2.jpg' },
    ];

    const results = await Promise.all(
      documents.map((doc) =>
        extractDocumentContentFromBuffer(doc.buffer, doc.mimeType, doc.filename),
      ),
    );

    // First doc: PDF with text
    expect(results[0].type).toBe('text');
    expect(results[0].text).toContain('Role A: Buyer');

    // Second doc: PNG image
    expect(results[1].type).toBe('image');
    expect(results[1].base64Image).toBeDefined();

    // Third doc: PDF with text
    expect(results[2].type).toBe('text');
    expect(results[2].text).toContain('Role B: Seller');

    // Fourth doc: JPEG image
    expect(results[3].type).toBe('image');
    expect(results[3].base64Image).toBeDefined();

    // Verify filenames preserved
    expect(results.map((r) => r.filename)).toEqual(['case.pdf', 'miro1.png', 'notes.pdf', 'miro2.jpg']);
  });
});
