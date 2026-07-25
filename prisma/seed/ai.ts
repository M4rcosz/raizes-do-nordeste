import { PrismaClient, type AiMessageRole } from '@prisma/client';
import { seedId } from './ids';
import { daysAgo } from './clock';
import type { People, PersonKey } from './people';

interface MembershipSpec {
  member: PersonKey;
  /** Tokens granted at enrolment; the balance is this minus everything spent. */
  grantedTokens: number;
  enrolledDaysAgo: number;
  revokedDaysAgo?: number;
}

interface ConversationSpec {
  key: string;
  owner: PersonKey;
  title: string;
  startedDaysAgo: number;
  deletedDaysAgo?: number;
  /** Alternating USER/MODEL turns, starting with the user. */
  turns: string[];
  /** One entry per metered model call, in the order they were charged. */
  tokenUsage: number[];
}

const MEMBERSHIPS: MembershipSpec[] = [
  { member: 'ana', grantedTokens: 50_000, enrolledDaysAgo: 60 },
  { member: 'felipe', grantedTokens: 30_000, enrolledDaysAgo: 40 },
  { member: 'clara', grantedTokens: 80_000, enrolledDaysAgo: 75 },
  { member: 'helena', grantedTokens: 120_000, enrolledDaysAgo: 50 },
  // Revoked membership: the balance and the spend history both survive the revoke,
  // only access stops.
  { member: 'henrique', grantedTokens: 20_000, enrolledDaysAgo: 35, revokedDaysAgo: 5 },
];

const CONVERSATIONS: ConversationSpec[] = [
  {
    key: 'ana-orders',
    owner: 'ana',
    title: 'Quantos pedidos eu fiz esse mes?',
    startedDaysAgo: 12,
    turns: [
      'Quantos pedidos eu fiz esse mes?',
      'Voce fez 2 pedidos nos ultimos 30 dias, ambos na unidade de Uberlandia.',
      'E quanto eu gastei no total?',
      'O total dos dois pedidos foi R$ 101,82 ja com os descontos aplicados.',
    ],
    tokenUsage: [820, 640],
  },
  {
    key: 'ana-last-order',
    owner: 'ana',
    title: 'Qual foi o valor do meu ultimo pedido?',
    startedDaysAgo: 2,
    turns: [
      'Qual foi o valor do meu ultimo pedido?',
      'Seu ultimo pedido saiu por R$ 39,00, com R$ 5,00 de promocao e 15 pontos resgatados.',
    ],
    tokenUsage: [910],
  },
  // Soft-deleted thread: hidden from the owner's listing, still accounted for in the
  // spend report because the ledger does not depend on the thread surviving.
  {
    key: 'ana-scratch',
    owner: 'ana',
    title: 'Teste de conversa',
    startedDaysAgo: 25,
    deletedDaysAgo: 24,
    turns: ['Teste de conversa', 'Ola! Como posso ajudar?'],
    tokenUsage: [310],
  },
  {
    key: 'helena-stock',
    owner: 'helena',
    title: 'Como esta o estoque da unidade de Uberaba?',
    startedDaysAgo: 8,
    turns: [
      'Como esta o estoque da unidade de Uberaba?',
      'A unidade tem 11 itens em estoque. Nenhum abaixo do minimo no momento.',
      'E na unidade de Patos de Minas?',
      'Patos de Minas tem 6 itens, sendo Coke 350ml zerado.',
      'Pode listar so os zerados?',
      'Apenas Coke 350ml esta com saldo zero em Patos de Minas.',
    ],
    tokenUsage: [1240, 1105, 980],
  },
  {
    key: 'helena-sales',
    owner: 'helena',
    title: 'Resumo de vendas da semana',
    startedDaysAgo: 3,
    turns: [
      'Resumo de vendas da semana',
      'Nas duas unidades sob sua gestao foram 4 pedidos entregues na ultima semana.',
    ],
    tokenUsage: [1480],
  },
  {
    key: 'felipe-promos',
    owner: 'felipe',
    title: 'Quais promocoes estao ativas agora?',
    startedDaysAgo: 6,
    turns: [
      'Quais promocoes estao ativas agora?',
      'Na unidade de Uberaba: Opening Week 20%, valida para pedidos acima de R$ 60,00.',
    ],
    tokenUsage: [760],
  },
];

// Spend whose thread is gone: conversationId is nullable and cleared on delete, so
// purging a thread can never subtract from what the admin report shows.
const ORPHANED_USAGE: { key: string; member: PersonKey; tokens: number; daysAgo: number }[] = [
  { key: 'henrique-1', member: 'henrique', tokens: 1450, daysAgo: 20 },
  { key: 'henrique-2', member: 'henrique', tokens: 2300, daysAgo: 14 },
  { key: 'clara-1', member: 'clara', tokens: 1890, daysAgo: 18 },
];

export async function seedAi(prisma: PrismaClient, people: People): Promise<void> {
  const spentByMember = new Map<PersonKey, number>();
  const addSpend = (member: PersonKey, tokens: number): void => {
    spentByMember.set(member, (spentByMember.get(member) ?? 0) + tokens);
  };

  for (const conversation of CONVERSATIONS) {
    const conversationId = seedId(`ai-conversation:${conversation.key}`);
    const startedAt = daysAgo(conversation.startedDaysAgo);

    await prisma.aiConversation.upsert({
      where: { id: conversationId },
      update: {},
      create: {
        id: conversationId,
        userId: people.ids[conversation.owner],
        title: conversation.title,
        deletedAt:
          conversation.deletedDaysAgo === undefined ? null : daysAgo(conversation.deletedDaysAgo),
        createdAt: startedAt,
        // The listing keysets on updatedAt, so the last turn is what must be stored
        // here, not the moment the seed ran.
        updatedAt: new Date(startedAt.getTime() + conversation.turns.length * 60 * 1000),
      },
    });

    for (const [index, content] of conversation.turns.entries()) {
      const role: AiMessageRole = index % 2 === 0 ? 'USER' : 'MODEL';
      await prisma.aiConversationMessage.upsert({
        where: { id: seedId(`ai-message:${conversation.key}:${String(index)}`) },
        update: {},
        create: {
          id: seedId(`ai-message:${conversation.key}:${String(index)}`),
          conversationId,
          role,
          content,
          createdAt: new Date(startedAt.getTime() + index * 60 * 1000),
        },
      });
    }

    for (const [index, tokens] of conversation.tokenUsage.entries()) {
      await prisma.aiTokenUsage.upsert({
        where: { id: seedId(`ai-usage:${conversation.key}:${String(index)}`) },
        update: {},
        create: {
          id: seedId(`ai-usage:${conversation.key}:${String(index)}`),
          userId: people.ids[conversation.owner],
          conversationId,
          tokensUsed: tokens,
          createdAt: new Date(startedAt.getTime() + (index * 2 + 1) * 60 * 1000),
        },
      });
      addSpend(conversation.owner, tokens);
    }
  }

  for (const usage of ORPHANED_USAGE) {
    await prisma.aiTokenUsage.upsert({
      where: { id: seedId(`ai-usage:orphan:${usage.key}`) },
      update: {},
      create: {
        id: seedId(`ai-usage:orphan:${usage.key}`),
        userId: people.ids[usage.member],
        conversationId: null,
        tokensUsed: usage.tokens,
        createdAt: daysAgo(usage.daysAgo),
      },
    });
    addSpend(usage.member, usage.tokens);
  }

  for (const membership of MEMBERSHIPS) {
    const spent = spentByMember.get(membership.member) ?? 0;
    const balance = membership.grantedTokens - spent;
    if (balance < 0) {
      throw new Error(`Seeded AI spend for ${membership.member} exceeds the granted tokens.`);
    }

    await prisma.aiMembership.upsert({
      where: { userId: people.ids[membership.member] },
      update: {},
      create: {
        id: seedId(`ai-membership:${membership.member}`),
        userId: people.ids[membership.member],
        // Balance is the grant minus everything on the ledger, so the report and the
        // remaining quota tell the same story.
        tokenBalance: balance,
        revokedAt:
          membership.revokedDaysAgo === undefined ? null : daysAgo(membership.revokedDaysAgo),
        createdAt: daysAgo(membership.enrolledDaysAgo),
        updatedAt: daysAgo(membership.revokedDaysAgo ?? membership.enrolledDaysAgo),
      },
    });
  }
}
