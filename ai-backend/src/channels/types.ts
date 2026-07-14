export type ChannelType = 'widget' | 'email' | 'voice' | 'social';

/**
 * Normalized incoming message structure for all communication channels.
 * Prevents channel handlers from leaking details into the core agent loop.
 */
export interface InboundMessageEnvelope {
  channel: ChannelType;
  /** Unique key identifying the chat session (e.g. visitorId, email message-id root, call SID) */
  sessionKey: string;
  /** Extracted clean text content of the message */
  text: string;
  /** Optional file URLs uploaded or attached */
  attachments?: string[];
  /** Channel-specific raw data or markers (e.g. from, subject, messageId) */
  metadata?: Record<string, any>;
}

/**
 * Normalized outbound response dispatched back to the channel handler.
 */
export interface OutboundMessageEnvelope {
  channel: ChannelType;
  sessionKey: string;
  text: string;
  metadata?: Record<string, any>;
}
