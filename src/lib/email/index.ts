import nodemailer from 'nodemailer';

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'noreply@persuaider.com',
    to,
    subject: 'Reset your Persuaider password',
    html: `<p>Click the link below to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 1 hour.</p><p>If you didn't request this, ignore this email.</p>`,
  });
}
