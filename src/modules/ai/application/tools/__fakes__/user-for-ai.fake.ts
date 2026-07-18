import type {
  UserAiActor,
  UserForAi,
  UserForAiView,
  UserListForAiFilters,
  UserListForAiResult,
} from '@modules/identity/application/ports/user-for-ai.port';

/**
 * In-memory UserForAi fake. Returns whatever was seeded and records the args it was
 * called with; it does NOT re-implement the ADMIN check, so a registry that wrongly
 * dispatches this tool for a non-admin shows up as a leak in the registry's own test
 * rather than being masked by the fake.
 */
export class FakeUserForAi implements UserForAi {
  private users: UserForAiView[] = [];
  readonly calls: { filters: UserListForAiFilters; actor: UserAiActor }[] = [];
  hasMore = false;

  seed(...users: UserForAiView[]): this {
    this.users = users;
    return this;
  }

  listForActor(filters: UserListForAiFilters, actor: UserAiActor): Promise<UserListForAiResult> {
    this.calls.push({ filters, actor });
    return Promise.resolve({ users: this.users, hasMore: this.hasMore });
  }
}
