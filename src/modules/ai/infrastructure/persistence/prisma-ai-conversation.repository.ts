import { Injectable } from '@nestjs/common';
import type {
  AiConversation as AiConversationModel,
  AiConversationMessage as AiConversationMessageModel,
} from '@prisma/client';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { AiConversation } from '@modules/ai/domain/entities/ai-conversation.entity';
import { AiConversationMessage } from '@modules/ai/domain/entities/ai-conversation-message.entity';
import {
  AiConversationRepository,
  AppendMessageInput,
  ListConversationsInput,
} from '@modules/ai/domain/repositories/ai-conversation.repository';

type AiConversationWithMessages = AiConversationModel & {
  messages: AiConversationMessageModel[];
};

// TODO(test): integration-tested against a real Postgres (testcontainers) once the
// migration is applied. The conditional soft-delete guard needs a real DB to prove.
@Injectable()
export class PrismaAiConversationRepository implements AiConversationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string): Promise<AiConversation> {
    const raw = await this.prisma.aiConversation.create({ data: { userId } });
    return this.toEntity(raw);
  }

  async appendMessages(conversationId: string, messages: AppendMessageInput[]): Promise<void> {
    if (messages.length === 0) {
      return;
    }
    // createMany keeps the insert order, which is the turn order the thread replays
    // in. The update is what moves the thread to the top of the listing, and both
    // must land together or a stored turn could sit under a stale updatedAt.
    await this.prisma.$transaction([
      this.prisma.aiConversationMessage.createMany({
        data: messages.map((message) => ({
          conversationId,
          role: message.role,
          content: message.content,
        })),
      }),
      this.prisma.aiConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      }),
    ]);
  }

  async findByIdForUser(
    id: string,
    userId: string,
    messageLimit?: number,
  ): Promise<AiConversation | null> {
    // userId and deletedAt are part of the query, not a post-filter: a foreign or
    // a deleted thread is indistinguishable from a nonexistent one.
    //
    // Limited load reads the NEWEST N (createdAt desc + take) because there is no
    // "last N ascending" in SQL, then flips them back so the caller always gets the
    // turns oldest-first. Unlimited keeps the plain ascending read.
    const raw = await this.prisma.aiConversation.findFirst({
      where: { id, userId, deletedAt: null },
      include: {
        messages:
          messageLimit === undefined
            ? { orderBy: { createdAt: 'asc' } }
            : { orderBy: { createdAt: 'desc' }, take: messageLimit },
      },
    });
    if (!raw) {
      return null;
    }
    if (messageLimit !== undefined) {
      raw.messages.reverse();
    }
    return this.toEntity(raw);
  }

  async listForUser(userId: string, input: ListConversationsInput): Promise<AiConversation[]> {
    const { take, keyset } = input;

    // Keyset, not `cursor`/`skip`: updatedAt moves every time a turn is appended, so
    // the row a positional cursor names routinely leaves the position it had and the
    // `skip: 1` would eat a different row. This compares sort VALUES, so the keyset
    // row need not exist. Mirrors the orderBy exactly: (updatedAt desc, id desc).
    const rows = await this.prisma.aiConversation.findMany({
      where: {
        userId,
        deletedAt: null,
        ...(keyset && {
          OR: [
            { updatedAt: { lt: keyset.updatedAt } },
            { updatedAt: keyset.updatedAt, id: { lt: keyset.id } },
          ],
        }),
      },
      // Last activity first; id breaks ties so the order is deterministic when two
      // threads share an updatedAt.
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take,
    });
    return rows.map((raw) => this.toEntity(raw));
  }

  async softDelete(id: string, userId: string): Promise<AiConversation | null> {
    // Conditional guard (deletedAt is null): only a live thread is stamped, so
    // concurrent deletes converge on one timestamp. The re-read is NOT filtered by
    // deletedAt, which is what makes a repeated delete idempotent (the row comes
    // back already deleted) while a foreign id still returns null.
    await this.prisma.aiConversation.updateMany({
      where: { id, userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    const raw = await this.prisma.aiConversation.findFirst({ where: { id, userId } });
    return raw ? this.toEntity(raw) : null;
  }

  private toEntity(raw: AiConversationModel | AiConversationWithMessages): AiConversation {
    const messages = 'messages' in raw ? raw.messages.map((m) => this.toMessageEntity(m)) : [];
    return new AiConversation(
      raw.id,
      raw.userId,
      raw.createdAt,
      raw.updatedAt,
      raw.deletedAt,
      messages,
    );
  }

  private toMessageEntity(raw: AiConversationMessageModel): AiConversationMessage {
    return new AiConversationMessage(
      raw.id,
      raw.conversationId,
      raw.role,
      raw.content,
      raw.createdAt,
    );
  }
}
