import { describe, expect, it } from '@jest/globals';
import {
  deriveConversationTitle,
  normalizeConversationTitle,
  FALLBACK_CONVERSATION_TITLE,
  MAX_CONVERSATION_TITLE_LENGTH,
} from './conversation-title';

describe('normalizeConversationTitle', () => {
  it('trims the ends', () => {
    expect(normalizeConversationTitle('  Estoque Centro  ')).toBe('Estoque Centro');
  });

  it('collapses internal whitespace runs to a single space', () => {
    expect(normalizeConversationTitle('Estoque    Centro')).toBe('Estoque Centro');
  });

  // A pasted multi-line message would otherwise store a title containing newlines,
  // which breaks substring search and renders badly in a list.
  it('flattens newlines and tabs into spaces', () => {
    expect(normalizeConversationTitle('Estoque\n\tCentro')).toBe('Estoque Centro');
  });

  it('returns empty for whitespace-only input, leaving the decision to the caller', () => {
    expect(normalizeConversationTitle('   \n  ')).toBe('');
  });
});

describe('deriveConversationTitle', () => {
  it('uses a short message verbatim', () => {
    expect(deriveConversationTitle('Qual o estoque de tapioca?')).toBe(
      'Qual o estoque de tapioca?',
    );
  });

  it('normalizes while deriving', () => {
    expect(deriveConversationTitle('  Qual o\n estoque?  ')).toBe('Qual o estoque?');
  });

  it('falls back when the message has no titleable text', () => {
    expect(deriveConversationTitle('   ')).toBe(FALLBACK_CONVERSATION_TITLE);
  });

  it('keeps a message sitting exactly on the cap intact', () => {
    const exact = 'a'.repeat(MAX_CONVERSATION_TITLE_LENGTH);

    expect(deriveConversationTitle(exact)).toBe(exact);
  });

  it('truncates past the cap and marks the cut', () => {
    const long = 'a'.repeat(MAX_CONVERSATION_TITLE_LENGTH + 20);

    const title = deriveConversationTitle(long);

    expect(title).toHaveLength(MAX_CONVERSATION_TITLE_LENGTH);
    expect(title.endsWith('...')).toBe(true);
  });

  it('cuts on a word boundary when one sits in the back half', () => {
    // 'palavra ' x 12 = 96 chars, so the cut lands mid-word without the boundary rule.
    const long = 'palavra '.repeat(12).trim();

    const title = deriveConversationTitle(long);

    expect(title.endsWith('palavra...')).toBe(true);
    expect(title.length).toBeLessThanOrEqual(MAX_CONVERSATION_TITLE_LENGTH);
  });

  // A boundary in the first half would cost more text than the tidiness is worth.
  it('ignores a word boundary that sits too early and cuts hard instead', () => {
    const long = `ab ${'c'.repeat(120)}`;

    const title = deriveConversationTitle(long);

    expect(title.startsWith('ab ccc')).toBe(true);
    expect(title).toHaveLength(MAX_CONVERSATION_TITLE_LENGTH);
  });

  // A surrogate that is not half of a well-formed pair. An emoji legitimately
  // contains two surrogates, so the naive /[\uD800-\uDFFF]/ would flag correct output.
  const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

  // Regression: slicing by UTF-16 unit would split a surrogate pair and store a lone
  // surrogate, which survives to the wire as a replacement character.
  it('never severs an astral character when truncating', () => {
    const long = '🌵'.repeat(MAX_CONVERSATION_TITLE_LENGTH + 10);

    const title = deriveConversationTitle(long);

    expect(title).not.toMatch(LONE_SURROGATE);
    expect(Array.from(title)).toHaveLength(MAX_CONVERSATION_TITLE_LENGTH);
  });

  // Guards the guard: proves the assertion above can actually fail, so the test is
  // not passing merely because the regex never matches anything.
  it('detects a lone surrogate when one is present', () => {
    const severed = '🌵'.slice(0, 1);

    expect(severed).toMatch(LONE_SURROGATE);
  });
});
