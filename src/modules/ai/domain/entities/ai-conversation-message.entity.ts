import { AiMessageRole } from '../value-objects/ai-message-role';

/**
 * One stored turn. Lives only inside an AiConversation (the aggregate root), which
 * is why it has no behavior of its own and is never loaded on its own.
 */
export class AiConversationMessage {
  constructor(
    public readonly id: string,
    public readonly conversationId: string,
    public readonly role: AiMessageRole,
    public readonly content: string,
    public readonly createdAt: Date,
  ) {}
}
