/**
 * Titles for chat threads. Two ways in, one shape out:
 *  - derived from the opening message when a thread is created (no model call, so a
 *    title costs nothing and never adds a failure mode to the chat path)
 *  - supplied by the owner on rename
 *
 * Both go through the same normalization, so a stored title is always a single-line,
 * whitespace-collapsed, length-capped string. That matters because the title is a
 * search target: leading spaces and embedded newlines would make substring matching
 * behave differently depending on which path wrote the row.
 */

/**
 * Counted in code points, not UTF-16 units. The column is TEXT (unbounded) so this
 * is a presentation cap, but slicing by code point is what keeps a truncation from
 * cutting an emoji in half and leaving a lone surrogate behind.
 */
export const MAX_CONVERSATION_TITLE_LENGTH = 80;

/** Marks a title that lost its tail, so the listing does not imply the text ended there. */
const ELLIPSIS = '...';

/** Used when the opening message carries no titleable text at all (e.g. only whitespace). */
export const FALLBACK_CONVERSATION_TITLE = 'New conversation';

/**
 * Collapses every whitespace run (newlines included) to one space and trims. Returns
 * empty for input that is nothing but whitespace - callers decide what that means:
 * derivation falls back to a default, rename rejects it.
 */
export function normalizeConversationTitle(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * Length in code points, which is the unit the cap is expressed in. `String.length`
 * would count an emoji as two and reject a title the derivation path would have
 * happily produced.
 */
export function conversationTitleLength(title: string): number {
  return Array.from(title).length;
}

/**
 * The title a brand-new thread opens with: its first user message, normalized and cut
 * to the cap. Cheap and deterministic, which is the whole point - a model-generated
 * title would be a second metered call, and this project debits and ledgers every
 * model call, so it could not be added without also charging the user for it.
 */
export function deriveConversationTitle(firstMessage: string): string {
  const normalized = normalizeConversationTitle(firstMessage);
  if (normalized === '') {
    return FALLBACK_CONVERSATION_TITLE;
  }
  return truncate(normalized);
}

function truncate(text: string): string {
  // Array.from splits on code points, so an astral character (emoji) counts once and
  // is never severed mid-pair. text.length would count it twice and slice() could cut
  // between the surrogates.
  const codePoints = Array.from(text);
  if (codePoints.length <= MAX_CONVERSATION_TITLE_LENGTH) {
    return text;
  }

  const budget = MAX_CONVERSATION_TITLE_LENGTH - ELLIPSIS.length;
  const clipped = codePoints.slice(0, budget).join('');

  // Prefer to end on a word boundary, but only when one sits in the back half: a
  // space at position 3 of 77 would throw away almost the whole title to gain
  // tidiness. Whitespace is already collapsed, so a single space is the only break.
  const lastSpace = clipped.lastIndexOf(' ');
  const cut = lastSpace >= budget / 2 ? clipped.slice(0, lastSpace) : clipped;

  return `${cut.trimEnd()}${ELLIPSIS}`;
}
