/**
 * Read-side projection of a persisted audit entry. Audit logs are append-only,
 * so this entity carries no business behavior - it just exposes the stored row.
 */
export class AuditLog {
  constructor(
    public readonly id: string,
    public readonly userId: string | null,
    public readonly action: string,
    public readonly entity: string,
    public readonly entityId: string | null,
    public readonly metadata: Record<string, unknown> | null,
    public readonly createdAt: Date,
  ) {}
}
