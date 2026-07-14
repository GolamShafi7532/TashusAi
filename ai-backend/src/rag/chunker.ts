/**
 * Semantic Markdown-header-aware chunker.
 *
 * Blueprint rule (§3.3): Blind fixed-length character-chunking is EXPLICITLY FORBIDDEN.
 * Chunks must respect document structure: never split mid-sentence, mid-table,
 * or mid-list-item. Primary split boundary is the Markdown header tree.
 *
 * Algorithm:
 *  1. Normalize raw PDF text per-page into Markdown (detect headings from caps/bold/numbering).
 *  2. Split on header boundaries (##, ###, ####).
 *  3. If a section > MAX_TOKENS, recursively split on paragraph → sentence boundaries.
 *  4. Apply 10% overlap (~51 tokens) across adjacent chunks.
 *  5. Prefix every chunk with its header breadcrumb path.
 *
 * Source of truth: AI Chatbot blueprint.md §3.3
 */

export const MAX_CHUNK_TOKENS = 512;
export const OVERLAP_TOKENS = Math.ceil(MAX_CHUNK_TOKENS * 0.1); // 51

export interface RawPage {
  pageNumber: number;
  text: string;
}

export interface Chunk {
  chunkIndex: number;
  content: string;      // breadcrumb-prefixed, overlap-inclusive
  pageNumber: number;
  tokenCount: number;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Convert an array of raw PDF pages into overlap-aware, breadcrumb-prefixed chunks.
 */
export function chunkPages(pages: RawPage[]): Chunk[] {
  const fullText = pages
    .map((p) => `<!-- page:${p.pageNumber} -->\n${p.text}`)
    .join('\n\n');

  const normalized = normalizeToMarkdown(fullText);
  const sections = splitOnHeaders(normalized);
  const rawChunks = sections.flatMap((s) => splitSection(s));
  return applyOverlap(rawChunks);
}

// ── Step 1: Normalize PDF text to Markdown ─────────────────────────────────────

interface Section {
  breadcrumb: string;   // e.g. "Cancellation Policy > Late Return Fees"
  pageNumber: number;
  text: string;
}

function normalizeToMarkdown(text: string): string {
  return (
    text
      // Detect ALL-CAPS lines as H2 headings
      .replace(/^([A-Z][A-Z\s]{3,})$/gm, (_, m) => `## ${titleCase(m.trim())}`)
      // Detect "1. Title" or "2.3 Sub-title" numbered headings as H3
      .replace(/^(\d+\.[\d.]*)\s+([A-Z][^\n]{2,40})$/gm, '### $1 $2')
      // Detect bold lines (PDF often exports bold as ALL-CAPS) as H3
      .replace(/^\*\*([^*\n]{3,60})\*\*\s*$/gm, '### $1')
      // Collapse 3+ blank lines to 2
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

function titleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Step 2: Split into sections by header boundaries ──────────────────────────

function splitOnHeaders(markdown: string): Section[] {
  // Match H1–H4 headers
  const headerRegex = /^(#{1,4})\s+(.+)$/gm;
  const sections: Section[] = [];
  let lastIndex = 0;
  let breadcrumbStack: string[] = [];
  let currentPageNumber = 1;
  let match: RegExpExecArray | null;

  while ((match = headerRegex.exec(markdown)) !== null) {
    const beforeHeader = markdown.slice(lastIndex, match.index).trim();

    if (beforeHeader && sections.length > 0) {
      sections[sections.length - 1].text += '\n\n' + beforeHeader;
    }

    const level = match[1].length;
    const title = match[2].trim();

    // Update breadcrumb stack
    breadcrumbStack = breadcrumbStack.slice(0, level - 1);
    breadcrumbStack.push(title);

    // Extract page number from nearest <!-- page:N --> comment
    const pageMatch = markdown
      .slice(Math.max(0, match.index - 200), match.index)
      .match(/<!-- page:(\d+) -->/);
    if (pageMatch) currentPageNumber = parseInt(pageMatch[1], 10);

    sections.push({
      breadcrumb: breadcrumbStack.join(' > '),
      pageNumber: currentPageNumber,
      text: '',
    });

    lastIndex = match.index + match[0].length;
  }

  // Append remaining text after last header
  const remainder = markdown.slice(lastIndex).trim();
  if (remainder) {
    if (sections.length > 0) {
      sections[sections.length - 1].text += '\n\n' + remainder;
    } else {
      sections.push({ breadcrumb: 'Document', pageNumber: 1, text: remainder });
    }
  }

  return sections.filter((s) => s.text.trim().length > 0);
}

// ── Step 3: Split oversized sections on paragraph → sentence boundaries ────────

interface RawChunk {
  content: string;
  pageNumber: number;
  breadcrumb: string;
}

function splitSection(section: Section): RawChunk[] {
  const prefixed = `${section.breadcrumb}:\n${section.text.trim()}`;
  const tokens = estimateTokens(prefixed);

  if (tokens <= MAX_CHUNK_TOKENS) {
    return [
      {
        content: prefixed,
        pageNumber: section.pageNumber,
        breadcrumb: section.breadcrumb,
      },
    ];
  }

  // Split on paragraph boundaries first
  const paragraphs = section.text.split(/\n\n+/);
  const chunks: RawChunk[] = [];
  let buffer = `${section.breadcrumb}:\n`;

  for (const para of paragraphs) {
    const candidate = buffer + para + '\n\n';
    if (estimateTokens(candidate) > MAX_CHUNK_TOKENS && buffer.trim().length > 0) {
      chunks.push({
        content: buffer.trimEnd(),
        pageNumber: section.pageNumber,
        breadcrumb: section.breadcrumb,
      });
      buffer = `${section.breadcrumb} (cont.):\n` + para + '\n\n';
    } else {
      buffer = candidate;
    }
  }

  if (buffer.trim().replace(`${section.breadcrumb}:`, '').trim().length > 0) {
    chunks.push({
      content: buffer.trimEnd(),
      pageNumber: section.pageNumber,
      breadcrumb: section.breadcrumb,
    });
  }

  // If any chunk is still too big, split on sentence boundaries
  return chunks.flatMap((chunk) =>
    estimateTokens(chunk.content) > MAX_CHUNK_TOKENS
      ? splitOnSentences(chunk)
      : [chunk]
  );
}

function splitOnSentences(chunk: RawChunk): RawChunk[] {
  const sentences = chunk.content.match(/[^.!?\n]+[.!?\n]+/g) ?? [chunk.content];
  const result: RawChunk[] = [];
  let buffer = `${chunk.breadcrumb}:\n`;

  for (const sentence of sentences) {
    const candidate = buffer + sentence;
    if (estimateTokens(candidate) > MAX_CHUNK_TOKENS && buffer.trim().length > 0) {
      result.push({ ...chunk, content: buffer.trimEnd() });
      buffer = `${chunk.breadcrumb} (cont.):\n` + sentence;
    } else {
      buffer = candidate;
    }
  }

  if (buffer.trim().replace(`${chunk.breadcrumb}:`, '').trim().length > 0) {
    result.push({ ...chunk, content: buffer.trimEnd() });
  }

  return result;
}

// ── Step 4: Apply 10% overlap between adjacent chunks ─────────────────────────

function applyOverlap(rawChunks: RawChunk[]): Chunk[] {
  return rawChunks.map((chunk, i): Chunk => {
    let content = chunk.content;

    if (i > 0) {
      const prev = rawChunks[i - 1].content;
      const prevWords = prev.split(/\s+/);
      // Take last OVERLAP_TOKENS worth of words from previous chunk (~0.75 words/token)
      const overlapWordCount = Math.floor(OVERLAP_TOKENS * 0.75);
      const overlapText = prevWords.slice(-overlapWordCount).join(' ');
      // Prepend overlap only if it doesn't duplicate the breadcrumb line
      if (!content.startsWith(overlapText.slice(0, 30))) {
        content = `[…] ${overlapText}\n\n${content}`;
      }
    }

    return {
      chunkIndex: i,
      content,
      pageNumber: chunk.pageNumber,
      tokenCount: estimateTokens(content),
    };
  });
}

// ── Token estimation ───────────────────────────────────────────────────────────
// Rough approximation: 1 token ≈ 4 characters. Good enough for chunking decisions.

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
