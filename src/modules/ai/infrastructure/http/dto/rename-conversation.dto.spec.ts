import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { MAX_CONVERSATION_TITLE_LENGTH } from '@modules/ai/domain/value-objects/conversation-title';
import { RenameConversationDto } from './rename-conversation.dto';

// Exercised through class-transformer + class-validator directly because the
// controller specs construct DTOs by hand and never run the global ValidationPipe -
// so a broken decorator here would otherwise be invisible until runtime.
const validate = (payload: Record<string, unknown>): string[] => {
  const dto = plainToInstance(RenameConversationDto, payload);
  return validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );
};

describe('RenameConversationDto', () => {
  it('accepts a plain title', () => {
    expect(validate({ title: 'Estoque Centro' })).toEqual([]);
  });

  it('rejects a missing title', () => {
    expect(validate({}).length).toBeGreaterThan(0);
  });

  it('rejects a non-string title without the transform throwing on it', () => {
    expect(validate({ title: 42 }).length).toBeGreaterThan(0);
  });

  it('normalizes before the use case sees it', () => {
    const dto = plainToInstance(RenameConversationDto, { title: '  Estoque\n\tCentro  ' });

    expect(dto.title).toBe('Estoque Centro');
  });

  it('rejects an unknown key, so a stray field cannot ride along', () => {
    expect(validate({ title: 'Estoque', userId: 'someone-else' }).length).toBeGreaterThan(0);
  });

  // The blank and length rules belong to RenameConversationUseCase, which answers 422.
  // Duplicating them here made the pipe answer 400 first and left the domain error
  // unreachable, so these must NOT be rejected at the border.
  describe('defers the blank and length rules to the use case', () => {
    it('passes a whitespace-only title through as empty', () => {
      expect(validate({ title: '   ' })).toEqual([]);
      expect(plainToInstance(RenameConversationDto, { title: '   ' }).title).toBe('');
    });

    it('passes an over-long title through untouched', () => {
      const long = 'a'.repeat(MAX_CONVERSATION_TITLE_LENGTH + 1);

      expect(validate({ title: long })).toEqual([]);
      expect(plainToInstance(RenameConversationDto, { title: long }).title).toBe(long);
    });

    // The case that made the split necessary: 80 emoji is 80 code points but 160
    // UTF-16 units, so @MaxLength(80) rejected a title deriveConversationTitle
    // produces happily.
    it('passes an 80-emoji title through, which a UTF-16 length check would reject', () => {
      const emoji = '🌵'.repeat(MAX_CONVERSATION_TITLE_LENGTH);

      expect(validate({ title: emoji })).toEqual([]);
    });
  });
});
