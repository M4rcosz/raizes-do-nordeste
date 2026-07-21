import type {
  UserDirectory,
  UserDirectoryEntry,
} from '@modules/identity/application/ports/user-directory.port';

/**
 * In-memory UserDirectory fake. Counts calls so a test can prove the identity
 * lookup is batched (one call) rather than one per row.
 */
export class FakeUserDirectory implements UserDirectory {
  readonly calls: string[][] = [];
  private readonly store = new Map<string, UserDirectoryEntry>();

  seed(entry: UserDirectoryEntry): void {
    this.store.set(entry.id, entry);
  }

  findByIds(ids: string[]): Promise<UserDirectoryEntry[]> {
    this.calls.push(ids);
    const found = ids
      .map((id) => this.store.get(id))
      .filter((entry): entry is UserDirectoryEntry => entry !== undefined);
    return Promise.resolve(found);
  }
}
