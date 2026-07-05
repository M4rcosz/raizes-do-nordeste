export class Category {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly description: string | null,
    public readonly isActive: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  isAvailable(): boolean {
    return this.isActive;
  }

  // Returns a new Category with only the provided keys overwritten. Immutable:
  // the receiver is untouched. Identity and lifecycle timestamps (id, createdAt,
  // updatedAt) are never patchable here - timestamps are owned by persistence.
  // Unlike Product, isActive is patchable here (the category has no separate
  // activate/deactivate route). A field is patched only when its value is not
  // undefined. The signature allows description: null for a future clear path,
  // but the HTTP DTO does not accept null today.
  withUpdatedFields(patch: {
    name?: string;
    description?: string | null;
    isActive?: boolean;
  }): Category {
    return new Category(
      this.id,
      patch.name !== undefined ? patch.name : this.name,
      patch.description !== undefined ? patch.description : this.description,
      patch.isActive !== undefined ? patch.isActive : this.isActive,
      this.createdAt,
      this.updatedAt,
    );
  }
}
