import { NextResponse } from 'next/server';
import { processInboundMessage } from '@/channels/process';
import { sendEmailReply } from '@/channels/email/sender';
import {
  extractTextBody,
  extractThreadRoot,
  extractSenderEmail,
} from '@/channels/email/parser';
import type { InboundMessageEnvelope } from '@/channels/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/ai/channels/email/webhook
 *
 * Inbound email webhook receiver.
 * Supports both SendGrid Inbound Parse and Postmark JSON formats.
 *
 * Flow:
 * 1. Parse inbound email payload (sender, subject, body, threading headers)
 * 2. Build an InboundMessageEnvelope
 * 3. Run processInboundMessage() to get AI response
 * 4. Send reply email in-thread via SMTP
 *
 * Security: In production, verify the webhook signature header
 * (e.g. SendGrid's X-Twilio-Email-Event-Webhook-Signature).
 */
export async function POST(req: Request) {
  try {
    const payload = await req.json();

    // ── Extract fields from the webhook payload ──────────────────────────────
    const senderEmail = extractSenderEmail(payload);
    const subject = payload.subject || payload.Subject || '(no subject)';
    const textBody = extractTextBody(payload);
    const messageId = payload.messageId || payload['Message-ID'] || payload.MessageID || '';

    // Threading headers
    const inReplyTo = payload.inReplyTo || payload['In-Reply-To'] || '';
    const references = payload.references || payload.References || '';
    const threadRoot = extractThreadRoot({ inReplyTo, references, messageId });

    if (!senderEmail) {
      return NextResponse.json({ error: 'Missing sender email' }, { status: 400 });
    }

    if (!textBody) {
      return NextResponse.json({ error: 'Empty email body' }, { status: 400 });
    }

    // ── Build the universal envelope ─────────────────────────────────────────
    const envelope: InboundMessageEnvelope = {
      channel: 'email',
      sessionKey: `email_${threadRoot}`,
      text: textBody,
      metadata: {
        from: senderEmail,
        subject,
        messageId,
        inReplyTo,
        references,
        threadRoot,
      },
    };

    // ── Process through the AI orchestrator ──────────────────────────────────
    const result = await processInboundMessage(envelope);

    // ── Send reply email ─────────────────────────────────────────────────────
    if (result.response && !result.isPaused) {
      await sendEmailReply({
        to: senderEmail,
        subject,
        body: result.response,
        inReplyTo: messageId,
        references: references ? `${references} ${messageId}` : messageId,
      });
    }

    return NextResponse.json({
      success: true,
      sessionId: result.sessionId,
      isPaused: result.isPaused,
    });
  } catch (err: any) {
    console.error('[EmailWebhook] Processing failed:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal processing error' },
      { status: 500 }
    );
  }
}
