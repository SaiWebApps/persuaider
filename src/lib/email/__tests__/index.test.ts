const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' });
const mockCreateTransport = jest.fn().mockReturnValue({ sendMail: mockSendMail });

jest.mock('nodemailer', () => ({
  createTransport: (...args: unknown[]) => mockCreateTransport(...args),
}));

import { sendPasswordResetEmail } from '../index';

describe('sendPasswordResetEmail', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls sendMail with correct to, subject, and html containing the reset URL', async () => {
    const resetUrl = 'https://example.com/reset-password?token=abc123';
    await sendPasswordResetEmail('user@test.com', resetUrl);

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const call = mockSendMail.mock.calls[0][0];
    expect(call.to).toBe('user@test.com');
    expect(call.subject).toBe('Reset your Persuaider password');
    expect(call.html).toContain(resetUrl);
  });

  it('uses EMAIL_FROM env var when set', async () => {
    process.env.EMAIL_FROM = 'custom@example.com';
    await sendPasswordResetEmail('user@test.com', 'https://example.com/reset');

    const call = mockSendMail.mock.calls[0][0];
    expect(call.from).toBe('custom@example.com');
    delete process.env.EMAIL_FROM;
  });

  it('uses default from address when EMAIL_FROM is not set', async () => {
    delete process.env.EMAIL_FROM;
    await sendPasswordResetEmail('user@test.com', 'https://example.com/reset');

    const call = mockSendMail.mock.calls[0][0];
    expect(call.from).toBe('noreply@persuaider.com');
  });
});
