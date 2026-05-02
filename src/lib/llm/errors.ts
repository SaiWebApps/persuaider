/**
 * LLM Error Types and Classification Utilities
 * 
 * This module provides custom error types for LLM operations,
 * enabling proper error classification for retry and fallback logic.
 */

/**
 * Enumeration of LLM error types for classification
 */
export enum LLMErrorType {
  /** Rate limit exceeded (429) - typically temporary */
  RATE_LIMIT = 'RATE_LIMIT',
  /** Quota/credit limit exceeded */
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  /** Network connectivity issues */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** Service temporarily unavailable (5xx) */
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  /** Invalid API key or permissions */
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  /** Invalid request format or parameters */
  INVALID_REQUEST = 'INVALID_REQUEST',
  /** Context length exceeded */
  CONTEXT_LENGTH_EXCEEDED = 'CONTEXT_LENGTH_EXCEEDED',
  /** Content filtered by safety systems */
  CONTENT_FILTERED = 'CONTENT_FILTERED',
  /** Unknown or unclassified error */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Custom error class for LLM operations with type classification
 */
export class LLMError extends Error {
  public readonly name = 'LLMError';

  constructor(
    message: string,
    public readonly type: LLMErrorType,
    public readonly provider: string,
    public readonly retryable: boolean,
    public readonly originalError?: Error,
    public readonly statusCode?: number
  ) {
    super(message);

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LLMError);
    }
  }

  /**
   * Create a string representation of the error for logging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      provider: this.provider,
      retryable: this.retryable,
      statusCode: this.statusCode,
      originalError: this.originalError?.message,
    };
  }
}

/**
 * Helper to extract Error from unknown, creating one if necessary
 */
function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const err = new Error(String((error as { message: unknown }).message));
    return err;
  }
  return new Error(String(error));
}

/**
 * Error classifier for OpenAI API errors
 */
export function classifyOpenAIError(error: unknown, provider: string): LLMError {
  // Handle OpenAI SDK errors
  if (error && typeof error === 'object' && 'status' in error) {
    const apiError = error as { status: number; message?: string; code?: string };
    const message = apiError.message || 'OpenAI API error';
    const status = apiError.status;
    const code = apiError.code;
    const originalError = toError(error);

    // Rate limit errors
    if (status === 429) {
      const isQuota = message.toLowerCase().includes('quota') ||
        message.toLowerCase().includes('billing') ||
        code === 'insufficient_quota';
      return new LLMError(
        message,
        isQuota ? LLMErrorType.QUOTA_EXCEEDED : LLMErrorType.RATE_LIMIT,
        provider,
        true,
        originalError,
        status
      );
    }

    // Authentication errors
    if (status === 401 || status === 403) {
      return new LLMError(
        message,
        LLMErrorType.AUTHENTICATION_ERROR,
        provider,
        false,
        originalError,
        status
      );
    }

    // Bad request errors
    if (status === 400) {
      if (message.toLowerCase().includes('context') ||
        message.toLowerCase().includes('token') ||
        code === 'context_length_exceeded') {
        return new LLMError(
          message,
          LLMErrorType.CONTEXT_LENGTH_EXCEEDED,
          provider,
          false,
          originalError,
          status
        );
      }
      return new LLMError(
        message,
        LLMErrorType.INVALID_REQUEST,
        provider,
        false,
        originalError,
        status
      );
    }

    // Service unavailable errors (5xx)
    if (status >= 500) {
      return new LLMError(
        message,
        LLMErrorType.SERVICE_UNAVAILABLE,
        provider,
        true,
        originalError,
        status
      );
    }
  }

  // Network errors
  if (error instanceof Error) {
    if (error.message.includes('ECONNREFUSED') ||
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('ENOTFOUND') ||
      error.message.includes('network') ||
      error.message.includes('fetch failed')) {
      return new LLMError(
        error.message,
        LLMErrorType.NETWORK_ERROR,
        provider,
        true,
        error
      );
    }
  }

  // Unknown error
  return new LLMError(
    error instanceof Error ? error.message : 'Unknown error',
    LLMErrorType.UNKNOWN,
    provider,
    true,
    error instanceof Error ? error : undefined
  );
}

/**
 * Error classifier for Anthropic API errors
 */
export function classifyAnthropicError(error: unknown, provider: string): LLMError {
  // Handle Anthropic SDK errors
  if (error && typeof error === 'object' && 'status' in error) {
    const apiError = error as { status: number; message?: string; error?: { type?: string } };
    const message = apiError.message || 'Anthropic API error';
    const status = apiError.status;
    const errorType = apiError.error?.type;
    const originalError = toError(error);

    // Rate limit errors
    if (status === 429) {
      const isQuota = errorType === 'insufficient_credit' ||
        message.toLowerCase().includes('quota') ||
        message.toLowerCase().includes('credit');
      return new LLMError(
        message,
        isQuota ? LLMErrorType.QUOTA_EXCEEDED : LLMErrorType.RATE_LIMIT,
        provider,
        true,
        originalError,
        status
      );
    }

    // Authentication errors
    if (status === 401 || status === 403) {
      return new LLMError(
        message,
        LLMErrorType.AUTHENTICATION_ERROR,
        provider,
        false,
        originalError,
        status
      );
    }

    // Bad request errors
    if (status === 400) {
      if (errorType === 'invalid_request_error' &&
        (message.toLowerCase().includes('context') ||
          message.toLowerCase().includes('token'))) {
        return new LLMError(
          message,
          LLMErrorType.CONTEXT_LENGTH_EXCEEDED,
          provider,
          false,
          originalError,
          status
        );
      }
      return new LLMError(
        message,
        LLMErrorType.INVALID_REQUEST,
        provider,
        false,
        originalError,
        status
      );
    }

    // Overloaded (529)
    if (status === 529) {
      return new LLMError(
        message,
        LLMErrorType.SERVICE_UNAVAILABLE,
        provider,
        true,
        originalError,
        status
      );
    }

    // Service unavailable errors (5xx)
    if (status >= 500) {
      return new LLMError(
        message,
        LLMErrorType.SERVICE_UNAVAILABLE,
        provider,
        true,
        originalError,
        status
      );
    }
  }

  // Network errors
  if (error instanceof Error) {
    if (error.message.includes('ECONNREFUSED') ||
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('ENOTFOUND') ||
      error.message.includes('network') ||
      error.message.includes('fetch failed')) {
      return new LLMError(
        error.message,
        LLMErrorType.NETWORK_ERROR,
        provider,
        true,
        error
      );
    }
  }

  // Unknown error
  return new LLMError(
    error instanceof Error ? error.message : 'Unknown error',
    LLMErrorType.UNKNOWN,
    provider,
    true,
    error instanceof Error ? error : undefined
  );
}

/**
 * Error classifier for Google Gemini API errors
 */
export function classifyGeminiError(error: unknown, provider: string): LLMError {
  // Handle Gemini SDK errors
  if (error && typeof error === 'object') {
    const apiError = error as {
      status?: number;
      statusCode?: number;
      message?: string;
      code?: string;
      errorDetails?: Array<{ reason?: string }>;
    };
    const message = apiError.message || 'Gemini API error';
    const status = apiError.status || apiError.statusCode;
    const code = apiError.code;
    const originalError = toError(error);

    // Rate limit errors
    if (status === 429 || code === 'RESOURCE_EXHAUSTED') {
      const isQuota = message.toLowerCase().includes('quota') ||
        message.toLowerCase().includes('billing') ||
        apiError.errorDetails?.some(d => d.reason === 'RATE_LIMIT_EXCEEDED');
      return new LLMError(
        message,
        isQuota ? LLMErrorType.QUOTA_EXCEEDED : LLMErrorType.RATE_LIMIT,
        provider,
        true,
        originalError,
        status
      );
    }

    // Authentication errors
    if (status === 401 || status === 403 || code === 'PERMISSION_DENIED' || code === 'UNAUTHENTICATED') {
      return new LLMError(
        message,
        LLMErrorType.AUTHENTICATION_ERROR,
        provider,
        false,
        originalError,
        status
      );
    }

    // Bad request errors
    if (status === 400 || code === 'INVALID_ARGUMENT') {
      if (message.toLowerCase().includes('context') ||
        message.toLowerCase().includes('token') ||
        message.toLowerCase().includes('too long')) {
        return new LLMError(
          message,
          LLMErrorType.CONTEXT_LENGTH_EXCEEDED,
          provider,
          false,
          originalError,
          status
        );
      }
      return new LLMError(
        message,
        LLMErrorType.INVALID_REQUEST,
        provider,
        false,
        originalError,
        status
      );
    }

    // Content filtered
    if (code === 'SAFETY' || message.toLowerCase().includes('safety') ||
      message.toLowerCase().includes('blocked')) {
      return new LLMError(
        message,
        LLMErrorType.CONTENT_FILTERED,
        provider,
        false,
        originalError,
        status
      );
    }

    // Service unavailable errors (5xx)
    if (status && status >= 500) {
      return new LLMError(
        message,
        LLMErrorType.SERVICE_UNAVAILABLE,
        provider,
        true,
        originalError,
        status
      );
    }
  }

  // Network errors
  if (error instanceof Error) {
    if (error.message.includes('ECONNREFUSED') ||
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('ENOTFOUND') ||
      error.message.includes('network') ||
      error.message.includes('fetch failed')) {
      return new LLMError(
        error.message,
        LLMErrorType.NETWORK_ERROR,
        provider,
        true,
        error
      );
    }
  }

  // Unknown error
  return new LLMError(
    error instanceof Error ? error.message : 'Unknown error',
    LLMErrorType.UNKNOWN,
    provider,
    true,
    error instanceof Error ? error : undefined
  );
}

