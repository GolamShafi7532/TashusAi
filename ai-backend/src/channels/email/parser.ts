/**
 * Utilities for parsing inbound email webhook payloads.
 * Compatible with SendGrid Inbound Parse and Postmark JSON formats.
 */

/**
 * Strip HTML tags and decode common HTML entities from an email body.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extract a clean text body from an inbound email payload.
 * Prefers plain text; falls back to HTML stripping.
 */
export function extractTextBody(payload: {
  text?: string;
  html?: string;
  TextBody?: string;   // Postmark format
  HtmlBody?: string;   // Postmark format
}): string {
  // Prefer plain text
  const plainText = payload.text || payload.TextBody;
  if (plainText && plainText.trim().length > 0) {
    return plainText.trim();
  }

  // Fall back to HTML stripping
  const htmlBody = payload.html || payload.HtmlBody;
  if (htmlBody) {
    return stripHtml(htmlBody);
  }

  return '';
}

/**
 * Extract the root Message-ID for threading from In-Reply-To or References headers.
 * Returns the first Message-ID in the References chain (the thread root).
 */
export function extractThreadRoot(headers: {
  inReplyTo?: string;
  references?: string;
  'In-Reply-To'?: string;
  References?: string;
  'Message-ID'?: string;
  messageId?: string;
}): string {
  // References is a space-separated list of Message-IDs; first one is the thread root
  const refs = headers.references || headers.References;
  if (refs) {
    const ids = refs.trim().split(/\s+/);
    if (ids.length > 0 && ids[0]) {
      return ids[0];
    }
  }

  // Fall back to In-Reply-To
  const inReplyTo = headers.inReplyTo || headers['In-Reply-To'];
  if (inReplyTo) {
    return inReplyTo.trim();
  }

  // Fall back to the message's own ID (new thread)
  return headers['Message-ID'] || headers.messageId || `thread_${Date.now()}`;
}

/**
 * Extract sender email address from various payload formats.
 */
export function extractSenderEmail(payload: {
  from?: string;
  From?: string;
  FromFull?: { Email: string };
  envelope?: { from: string };
}): string {
  // Postmark format
  if (payload.FromFull?.Email) {
    return payload.FromFull.Email;
  }

  // SendGrid / generic format — extract email from "Name <email>" format
  const rawFrom = payload.from || payload.From || payload.envelope?.from || '';
  const match = rawFrom.match(/<([^>]+)>/);
  if (match) return match[1];
  return rawFrom.trim();
}
