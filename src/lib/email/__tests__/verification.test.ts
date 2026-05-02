/**
 * @jest-environment node
 */

const mockSendMail = jest.fn().mockResolvedValue(undefined);

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: jest.fn().mockReturnValue({
      sendMail: (...args: unknown[]) => mockSendMail(...args),
    }),
  },
}));

import { sendVerificationEmail } from '../verification';

describe('sendVerificationEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EMAIL_FROM = 'test@persuaider.com';
  });

  it('calls sendMail with correct params', async () => {
    await sendVerificationEmail('user@test.com', 'http://localhost:3000/verify-email?token=abc123');

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledWith({
      from: 'test@persuaider.com',
      to: 'user@test.com',
      subject: 'Verify your Persuaider account',
      html: expect.stringContaining('http://localhost:3000/verify-email?token=abc123'),
    });
  });

  it('uses default from address when EMAIL_FROM is not set', async () => {
    delete process.env.EMAIL_FROM;

    await sendVerificationEmail('user@test.com', 'http://example.com/verify');

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'noreply@persuaider.com',
      })
    );
  });

  it('includes expiry notice in HTML body', async () => {
    await sendVerificationEmail('user@test.com', 'http://example.com/verify');

    const call = mockSendMail.mock.calls[0][0];
    expect(call.html).toContain('expires in 24 hours');
  });

  it('includes the verification URL as a clickable link', async () => {
    const url = 'http://localhost:3000/verify-email?token=xyz';
    await sendVerificationEmail('user@test.com', url);

    const call = mockSendMail.mock.calls[0][0];
    expect(call.html).toContain(`<a href="${url}">`);
  });
});
