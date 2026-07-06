export class BusinessUnit {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly cnpj: string,
    public readonly address: string,
    public readonly city: string,
    public readonly phone: string,
    public readonly isActive: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  isAvailable(): boolean {
    return this.isActive;
  }

  // Returns a new BusinessUnit with only the provided keys overwritten. Immutable:
  // the receiver is untouched. Identity and lifecycle fields (id, cnpj, isActive,
  // createdAt, updatedAt) are never patchable here - cnpj is the unit's fiscal
  // identity, isActive has its own activate/deactivate routes and timestamps are
  // owned by persistence. A field counts as provided only when not undefined.
  withUpdatedFields(patch: {
    name?: string;
    address?: string;
    city?: string;
    phone?: string;
  }): BusinessUnit {
    return new BusinessUnit(
      this.id,
      patch.name !== undefined ? patch.name : this.name,
      this.cnpj,
      patch.address !== undefined ? patch.address : this.address,
      patch.city !== undefined ? patch.city : this.city,
      patch.phone !== undefined ? patch.phone : this.phone,
      this.isActive,
      this.createdAt,
      this.updatedAt,
    );
  }
}
