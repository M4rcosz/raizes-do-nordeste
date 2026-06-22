import { Module } from '@nestjs/common';
import { PRODUCT_REPOSITORY } from './domain/repositories/product.repository';
import { PrismaProductRepository } from './infrastructure/persistence/prisma-product.repository';
import { ProductsController } from './infrastructure/http/controllers/products.controller';
import { GetActiveProductsUseCase } from './application/use-cases/get-active-products.use-case';
import { GetProductsByBusinessUnitUseCase } from './application/use-cases/get-products-by-business-unit.use-case';
import { GetProductByIdUseCase } from './application/use-cases/get-product-by-id.use-case';
import { CreateProductUseCase } from './application/use-cases/create-product.use-case';
import { BUSINESS_UNIT_REPOSITORY } from './domain/repositories/business-unit.repository';
import { PrismaBusinessUnitRepository } from './infrastructure/persistence/prisma-business-unit.repository';
import { BusinessUnitsController } from './infrastructure/http/controllers/business-units.controller';
import { CreateBusinessUnitUseCase } from './application/use-cases/create-business-unit.use-case';
import { ListBusinessUnitsUseCase } from './application/use-cases/list-business-units.use-case';
import { GetBusinessUnitByIdUseCase } from './application/use-cases/get-business-unit-by-id.use-case';

@Module({
  controllers: [ProductsController, BusinessUnitsController],
  providers: [
    {
      provide: PRODUCT_REPOSITORY,
      useClass: PrismaProductRepository,
    },
    GetActiveProductsUseCase,
    GetProductsByBusinessUnitUseCase,
    GetProductByIdUseCase,
    CreateProductUseCase,
    {
      provide: BUSINESS_UNIT_REPOSITORY,
      useClass: PrismaBusinessUnitRepository,
    },
    CreateBusinessUnitUseCase,
    ListBusinessUnitsUseCase,
    GetBusinessUnitByIdUseCase,
  ],
})
export class BusinessUnitsModule {}
