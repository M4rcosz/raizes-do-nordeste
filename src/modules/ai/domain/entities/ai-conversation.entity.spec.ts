import { describe, expect, it } from '@jest/globals';
import { AiConversation } from './ai-conversation.entity';
import { AiConversationMessage } from './ai-conversation-message.entity';
import { AiMessageRole } from '../value-objects/ai-message-role';

const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');

function conversation(deletedAt: Date | null = null): AiConversation {
  return new AiConversation(
    'conv-1',
    'user-1',
    'Estoque Centro',
    CREATED_AT,
    CREATED_AT,
    deletedAt,
  );
}

describe('AiConversation', () => {
  it('is not deleted while deletedAt is null', () => {
    expect(conversation().isDeleted).toBe(false);
  });

  it('reports deleted once stamped', () => {
    const deleted = conversation().softDelete(new Date('2026-02-01T00:00:00.000Z'));

    expect(deleted.isDeleted).toBe(true);
    expect(deleted.deletedAt).toEqual(new Date('2026-02-01T00:00:00.000Z'));
  });

  it('keeps the original timestamp when deleted twice', () => {
    const first = new Date('2026-02-01T00:00:00.000Z');
    const deleted = conversation().softDelete(first);

    const again = deleted.softDelete(new Date('2026-03-01T00:00:00.000Z'));

    expect(again.deletedAt).toEqual(first);
  });

  it('leaves the original instance untouched', () => {
    const original = conversation();

    original.softDelete();

    expect(original.isDeleted).toBe(false);
  });

  it('carries its messages through a soft delete', () => {
    const message = new AiConversationMessage(
      'msg-1',
      'conv-1',
      AiMessageRole.USER,
      'hi',
      CREATED_AT,
    );
    const withMessages = new AiConversation(
      'conv-1',
      'user-1',
      'Estoque Centro',
      CREATED_AT,
      CREATED_AT,
      null,
      [message],
    );

    expect(withMessages.softDelete().messages).toEqual([message]);
  });

  it('carries the new title through a rename and leaves everything else alone', () => {
    const original = conversation();

    const renamed = original.rename('Tapioca Boa Viagem');

    expect(renamed.title).toBe('Tapioca Boa Viagem');
    expect(renamed.id).toBe(original.id);
    expect(renamed.userId).toBe(original.userId);
    expect(renamed.createdAt).toEqual(original.createdAt);
    expect(renamed.deletedAt).toBeNull();
  });

  it('leaves the original instance untouched on rename', () => {
    const original = conversation();

    original.rename('Tapioca Boa Viagem');

    expect(original.title).toBe('Estoque Centro');
  });

  it('keeps its title through a soft delete', () => {
    expect(conversation().softDelete().title).toBe('Estoque Centro');
  });

  it('recognises its owner and rejects anyone else', () => {
    expect(conversation().isOwnedBy('user-1')).toBe(true);
    expect(conversation().isOwnedBy('user-2')).toBe(false);
  });
});
