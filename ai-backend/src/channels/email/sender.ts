import nodemailer from 'nodemailer';

/**
 * SMTP transporter for sending email replies.
 * Configured via environment variables:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 */
function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false, // STARTTLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

interface SendEmailReplyOptions {
  /** Recipient email address */
  to: string;
  /** Original subject line (we prepend Re: if missing) */
  subject: string;
  /** AI-generated reply body (plain text) */
  body: string;
  /** Original Message-ID header for threading */
  inReplyTo?: string;
  /** References header chain for threading */
  references?: string;
}

/**
 * Send an email reply in the same thread as the original inbound message.
 * Uses In-Reply-To and References headers so email clients group the conversation.
 */
export async function sendEmailReply(opts: SendEmailReplyOptions): Promise<void> {
  const fromAddress = process.env.SMTP_FROM || 'support@tashus.com';
  const subject = opts.subject.startsWith('Re:') ? opts.subject : `Re: ${opts.subject}`;

  const transporter = getTransporter();

  await transporter.sendMail({
    from: `"Tashus Support" <${fromAddress}>`,
    to: opts.to,
    subject,
    text: `${opts.body}\n\n---\nPowered by Tashus AI`,
    headers: {
      ...(opts.inReplyTo ? { 'In-Reply-To': opts.inReplyTo } : {}),
      ...(opts.references ? { References: opts.references } : {}),
    },
  });
}
