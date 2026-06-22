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
}
