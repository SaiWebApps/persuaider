import {
  LLMError,
  LLMErrorType,
  classifyOpenAIError,
  classifyAnthropicError,
  classifyGeminiError,
} from '../errors';

describe('LLMError', () => {
  it('creates with all required fields', () => {
    const error = new LLMError('test error', LLMErrorType.RATE_LIMIT, 'openai', true);
    expect(error.message).toBe('test error');
    expect(error.type).toBe(LLMErrorType.RATE_LIMIT);
    expect(error.provider).toBe('openai');
    expect(error.retryable).toBe(true);
    expect(error.name).toBe('LLMError');
  });

  it('creates with optional fields', () => {
    const original = new Error('original');
    const error = new LLMError('test', LLMErrorType.UNKNOWN, 'anthropic', false, original, 500);
    expect(error.originalError).toBe(original);
    expect(error.statusCode).toBe(500);
  });

  it('is an instance of Error', () => {
    const error = new LLMError('test', LLMErrorType.UNKNOWN, 'openai', true);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(LLMError);
  });

  it('serializes to JSON correctly', () => {
    const original = new Error('orig');
    const error = new LLMError('msg', LLMErrorType.RATE_LIMIT, 'gemini', true, original, 429);
    const json = error.toJSON();
    expect(json).toEqual({
      name: 'LLMError',
      message: 'msg',
      type: 'RATE_LIMIT',
      provider: 'gemini',
      retryable: true,
      statusCode: 429,
      originalError: 'orig',
    });
  });

  it('serializes without optional fields', () => {
    const error = new LLMError('msg', LLMErrorType.UNKNOWN, 'openai', false);
    const json = error.toJSON();
    expect(json.originalError).toBeUndefined();
    expect(json.statusCode).toBeUndefined();
  });
});

describe('classifyOpenAIError', () => {
  it('classifies 429 as RATE_LIMIT', () => {
    const result = classifyOpenAIError({ status: 429, message: 'Rate limited' }, 'openai');
    expect(result.type).toBe(LLMErrorType.RATE_LIMIT);
    expect(result.retryable).toBe(true);
    expect(result.statusCode).toBe(429);
  });

  it('classifies 429 with quota message as QUOTA_EXCEEDED', () => {
    const result = classifyOpenAIError(
      { status: 429, message: 'You have exceeded your quota' },
      'openai'
    );
    expect(result.type).toBe(LLMErrorType.QUOTA_EXCEEDED);
  });

  it('classifies 429 with insufficient_quota code as QUOTA_EXCEEDED', () => {
    const result = classifyOpenAIError(
      { status: 429, message: 'error', code: 'insufficient_quota' },
      'openai'
    );
    expect(result.type).toBe(LLMErrorType.QUOTA_EXCEEDED);
  });

  it('classifies 401 as AUTHENTICATION_ERROR', () => {
    const result = classifyOpenAIError({ status: 401, message: 'Invalid key' }, 'openai');
    expect(result.type).toBe(LLMErrorType.AUTHENTICATION_ERROR);
    expect(result.retryable).toBe(false);
  });

  it('classifies 403 as AUTHENTICATION_ERROR', () => {
    const result = classifyOpenAIError({ status: 403, message: 'Forbidden' }, 'openai');
    expect(result.type).toBe(LLMErrorType.AUTHENTICATION_ERROR);
  });

  it('classifies 400 with context message as CONTEXT_LENGTH_EXCEEDED', () => {
    const result = classifyOpenAIError(
      { status: 400, message: 'maximum context length exceeded' },
      'openai'
    );
    expect(result.type).toBe(LLMErrorType.CONTEXT_LENGTH_EXCEEDED);
    expect(result.retryable).toBe(false);
  });

  it('classifies 400 with token message as CONTEXT_LENGTH_EXCEEDED', () => {
    const result = classifyOpenAIError(
      { status: 400, message: 'too many token in request' },
      'openai'
    );
    expect(result.type).toBe(LLMErrorType.CONTEXT_LENGTH_EXCEEDED);
  });

  it('classifies 400 with context_length_exceeded code as CONTEXT_LENGTH_EXCEEDED', () => {
    const result = classifyOpenAIError(
      { status: 400, message: 'error', code: 'context_length_exceeded' },
      'openai'
    );
    expect(result.type).toBe(LLMErrorType.CONTEXT_LENGTH_EXCEEDED);
  });

  it('classifies 400 without context/token as INVALID_REQUEST', () => {
    const result = classifyOpenAIError({ status: 400, message: 'Bad request' }, 'openai');
    expect(result.type).toBe(LLMErrorType.INVALID_REQUEST);
    expect(result.retryable).toBe(false);
  });

  it('classifies 500 as SERVICE_UNAVAILABLE', () => {
    const result = classifyOpenAIError({ status: 500, message: 'Server error' }, 'openai');
    expect(result.type).toBe(LLMErrorType.SERVICE_UNAVAILABLE);
    expect(result.retryable).toBe(true);
  });

  it('classifies 503 as SERVICE_UNAVAILABLE', () => {
    const result = classifyOpenAIError({ status: 503, message: 'Service unavailable' }, 'openai');
    expect(result.type).toBe(LLMErrorType.SERVICE_UNAVAILABLE);
  });

  it('classifies ECONNREFUSED as NETWORK_ERROR', () => {
    const result = classifyOpenAIError(new Error('ECONNREFUSED'), 'openai');
    expect(result.type).toBe(LLMErrorType.NETWORK_ERROR);
    expect(result.retryable).toBe(true);
  });

  it('classifies ETIMEDOUT as NETWORK_ERROR', () => {
    const result = classifyOpenAIError(new Error('ETIMEDOUT'), 'openai');
    expect(result.type).toBe(LLMErrorType.NETWORK_ERROR);
  });

  it('classifies fetch failed as NETWORK_ERROR', () => {
    const result = classifyOpenAIError(new Error('fetch failed'), 'openai');
    expect(result.type).toBe(LLMErrorType.NETWORK_ERROR);
  });

  it('classifies unknown error as UNKNOWN', () => {
    const result = classifyOpenAIError(new Error('something happened'), 'openai');
    expect(result.type).toBe(LLMErrorType.UNKNOWN);
    expect(result.retryable).toBe(true);
  });

  it('handles non-Error unknown values', () => {
    const result = classifyOpenAIError('string error', 'openai');
    expect(result.type).toBe(LLMErrorType.UNKNOWN);
    expect(result.message).toBe('Unknown error');
  });

  it('preserves provider name', () => {
    const result = classifyOpenAIError(new Error('test'), 'my-openai');
    expect(result.provider).toBe('my-openai');
  });
});

describe('classifyAnthropicError', () => {
  it('classifies 429 as RATE_LIMIT', () => {
    const result = classifyAnthropicError({ status: 429, message: 'Rate limited' }, 'anthropic');
    expect(result.type).toBe(LLMErrorType.RATE_LIMIT);
    expect(result.retryable).toBe(true);
  });

  it('classifies 429 with insufficient_credit as QUOTA_EXCEEDED', () => {
    const result = classifyAnthropicError(
      { status: 429, message: 'error', error: { type: 'insufficient_credit' } },
      'anthropic'
    );
    expect(result.type).toBe(LLMErrorType.QUOTA_EXCEEDED);
  });

  it('classifies 401 as AUTHENTICATION_ERROR', () => {
    const result = classifyAnthropicError({ status: 401, message: 'Invalid key' }, 'anthropic');
    expect(result.type).toBe(LLMErrorType.AUTHENTICATION_ERROR);
    expect(result.retryable).toBe(false);
  });

  it('classifies 400 with context in invalid_request_error as CONTEXT_LENGTH_EXCEEDED', () => {
    const result = classifyAnthropicError(
      {
        status: 400,
        message: 'context window exceeded',
        error: { type: 'invalid_request_error' },
      },
      'anthropic'
    );
    expect(result.type).toBe(LLMErrorType.CONTEXT_LENGTH_EXCEEDED);
  });

  it('classifies 400 without context/token as INVALID_REQUEST', () => {
    const result = classifyAnthropicError(
      { status: 400, message: 'Bad request' },
      'anthropic'
    );
    expect(result.type).toBe(LLMErrorType.INVALID_REQUEST);
  });

  it('classifies 529 (overloaded) as SERVICE_UNAVAILABLE', () => {
    const result = classifyAnthropicError({ status: 529, message: 'Overloaded' }, 'anthropic');
    expect(result.type).toBe(LLMErrorType.SERVICE_UNAVAILABLE);
    expect(result.retryable).toBe(true);
  });

  it('classifies 500 as SERVICE_UNAVAILABLE', () => {
    const result = classifyAnthropicError({ status: 500, message: 'Server error' }, 'anthropic');
    expect(result.type).toBe(LLMErrorType.SERVICE_UNAVAILABLE);
  });

  it('classifies ENOTFOUND as NETWORK_ERROR', () => {
    const result = classifyAnthropicError(new Error('ENOTFOUND'), 'anthropic');
    expect(result.type).toBe(LLMErrorType.NETWORK_ERROR);
  });

  it('classifies unknown error as UNKNOWN', () => {
    const result = classifyAnthropicError('something', 'anthropic');
    expect(result.type).toBe(LLMErrorType.UNKNOWN);
  });
});

describe('classifyGeminiError', () => {
  it('classifies 429 as RATE_LIMIT', () => {
    const result = classifyGeminiError({ status: 429, message: 'Rate limited' }, 'gemini');
    expect(result.type).toBe(LLMErrorType.RATE_LIMIT);
    expect(result.retryable).toBe(true);
  });

  it('classifies RESOURCE_EXHAUSTED code as RATE_LIMIT', () => {
    const result = classifyGeminiError(
      { code: 'RESOURCE_EXHAUSTED', message: 'Resource exhausted' },
      'gemini'
    );
    expect(result.type).toBe(LLMErrorType.RATE_LIMIT);
  });

  it('classifies 429 with quota message as QUOTA_EXCEEDED', () => {
    const result = classifyGeminiError(
      { status: 429, message: 'quota exceeded' },
      'gemini'
    );
    expect(result.type).toBe(LLMErrorType.QUOTA_EXCEEDED);
  });

  it('classifies 401 as AUTHENTICATION_ERROR', () => {
    const result = classifyGeminiError({ status: 401, message: 'Unauthenticated' }, 'gemini');
    expect(result.type).toBe(LLMErrorType.AUTHENTICATION_ERROR);
    expect(result.retryable).toBe(false);
  });

  it('classifies PERMISSION_DENIED code as AUTHENTICATION_ERROR', () => {
    const result = classifyGeminiError(
      { code: 'PERMISSION_DENIED', message: 'No access' },
      'gemini'
    );
    expect(result.type).toBe(LLMErrorType.AUTHENTICATION_ERROR);
  });

  it('classifies UNAUTHENTICATED code as AUTHENTICATION_ERROR', () => {
    const result = classifyGeminiError(
      { code: 'UNAUTHENTICATED', message: 'No auth' },
      'gemini'
    );
    expect(result.type).toBe(LLMErrorType.AUTHENTICATION_ERROR);
  });

  it('classifies 400 with "too long" message as CONTEXT_LENGTH_EXCEEDED', () => {
    const result = classifyGeminiError(
      { status: 400, message: 'Input too long' },
      'gemini'
    );
    expect(result.type).toBe(LLMErrorType.CONTEXT_LENGTH_EXCEEDED);
  });

  it('classifies INVALID_ARGUMENT code as INVALID_REQUEST', () => {
    const result = classifyGeminiError(
      { code: 'INVALID_ARGUMENT', message: 'Bad argument' },
      'gemini'
    );
    expect(result.type).toBe(LLMErrorType.INVALID_REQUEST);
  });

  it('classifies SAFETY code as CONTENT_FILTERED', () => {
    const result = classifyGeminiError(
      { code: 'SAFETY', message: 'Content blocked' },
      'gemini'
    );
    expect(result.type).toBe(LLMErrorType.CONTENT_FILTERED);
    expect(result.retryable).toBe(false);
  });

  it('classifies message containing "blocked" as CONTENT_FILTERED', () => {
    const result = classifyGeminiError(
      { message: 'Response was blocked by safety settings' },
      'gemini'
    );
    expect(result.type).toBe(LLMErrorType.CONTENT_FILTERED);
  });

  it('classifies 500 as SERVICE_UNAVAILABLE', () => {
    const result = classifyGeminiError({ status: 500, message: 'Server error' }, 'gemini');
    expect(result.type).toBe(LLMErrorType.SERVICE_UNAVAILABLE);
    expect(result.retryable).toBe(true);
  });

  it('classifies network errors', () => {
    const result = classifyGeminiError(new Error('ECONNREFUSED'), 'gemini');
    expect(result.type).toBe(LLMErrorType.NETWORK_ERROR);
  });

  it('classifies unknown error', () => {
    const result = classifyGeminiError('unknown', 'gemini');
    expect(result.type).toBe(LLMErrorType.UNKNOWN);
  });

  it('uses statusCode field when status is absent', () => {
    const result = classifyGeminiError({ statusCode: 500, message: 'Error' }, 'gemini');
    expect(result.type).toBe(LLMErrorType.SERVICE_UNAVAILABLE);
    expect(result.statusCode).toBe(500);
  });
});
