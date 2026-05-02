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

export async function sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'noreply@persuaider.com',
    to,
    subject: 'Verify your Persuaider account',
    html: `<p>Click the link below to verify your email address:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in 24 hours.</p><p>If you didn't create an account, ignore this email.</p>`,
  });
}
