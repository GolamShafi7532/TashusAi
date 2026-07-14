import {
  stripHtml,
  extractTextBody,
  extractThreadRoot,
  extractSenderEmail,
} from '@/channels/email/parser';

describe('Email Parser Utilities', () => {
  // ── stripHtml ─────────────────────────────────────────────────────────────
  describe('stripHtml', () => {
    it('removes HTML tags and decodes entities', () => {
      const html = '<p>Hello &amp; welcome!</p><br><b>Bold text</b>';
      const result = stripHtml(html);
      expect(result).toContain('Hello & welcome!');
      expect(result).toContain('Bold text');
      expect(result).not.toContain('<p>');
      expect(result).not.toContain('<b>');
    });

    it('removes style and script blocks', () => {
      const html = '<style>.x { color: red; }</style><p>Content</p><script>alert(1)</script>';
      expect(stripHtml(html)).toBe('Content');
    });

    it('converts <br> to newlines', () => {
      const html = 'Line1<br>Line2<br/>Line3';
      const result = stripHtml(html);
      expect(result).toBe('Line1\nLine2\nLine3');
    });

    it('collapses excessive newlines', () => {
      const html = '<p>A</p><p>B</p><p></p><p></p><p>C</p>';
      const result = stripHtml(html);
      expect(result).not.toMatch(/\n{3,}/);
    });
  });

  // ── extractTextBody ───────────────────────────────────────────────────────
  describe('extractTextBody', () => {
    it('prefers plain text over HTML', () => {
      const result = extractTextBody({
        text: 'Plain text body',
        html: '<p>HTML body</p>',
      });
      expect(result).toBe('Plain text body');
    });

    it('falls back to stripped HTML when text is empty', () => {
      const result = extractTextBody({
        text: '',
        html: '<p>HTML fallback</p>',
      });
      expect(result).toContain('HTML fallback');
    });

    it('supports Postmark TextBody/HtmlBody fields', () => {
      expect(extractTextBody({ TextBody: 'Postmark text' })).toBe('Postmark text');
      expect(extractTextBody({ HtmlBody: '<b>Postmark HTML</b>' })).toBe('Postmark HTML');
    });

    it('returns empty string when no content provided', () => {
      expect(extractTextBody({})).toBe('');
    });
  });

  // ── extractThreadRoot ─────────────────────────────────────────────────────
  describe('extractThreadRoot', () => {
    it('returns first ID from References header', () => {
      const result = extractThreadRoot({
        references: '<root@example.com> <reply1@example.com> <reply2@example.com>',
        inReplyTo: '<reply2@example.com>',
      });
      expect(result).toBe('<root@example.com>');
    });

    it('falls back to In-Reply-To when References is missing', () => {
      const result = extractThreadRoot({
        inReplyTo: '<original@example.com>',
      });
      expect(result).toBe('<original@example.com>');
    });

    it('falls back to Message-ID for new threads', () => {
      const result = extractThreadRoot({
        'Message-ID': '<new-thread@example.com>',
      });
      expect(result).toBe('<new-thread@example.com>');
    });

    it('generates a fallback ID when nothing is provided', () => {
      const result = extractThreadRoot({});
      expect(result).toMatch(/^thread_\d+$/);
    });
  });

  // ── extractSenderEmail ────────────────────────────────────────────────────
  describe('extractSenderEmail', () => {
    it('extracts email from "Name <email>" format', () => {
      expect(extractSenderEmail({ from: 'John Doe <john@example.com>' })).toBe('john@example.com');
    });

    it('handles bare email address', () => {
      expect(extractSenderEmail({ from: 'bare@example.com' })).toBe('bare@example.com');
    });

    it('handles Postmark FromFull format', () => {
      expect(extractSenderEmail({
        FromFull: { Email: 'postmark@example.com' },
      })).toBe('postmark@example.com');
    });

    it('handles envelope.from format', () => {
      expect(extractSenderEmail({
        envelope: { from: 'envelope@example.com' },
      })).toBe('envelope@example.com');
    });
  });
});
