import { Module } from '@nestjs/common';
import { PRODUCT_REPOSITORY } from './domain/repositories/product.repository';
import { PrismaProductRepository } from './infrastructure/persistence/prisma-product.repository';
import { ProductsController } from './infrastructure/http/controllers/products.controller';
import { GetActiveProductsUseCase } from './application/use-cases/get-active-products.use-case';
import { GetProductsByBusinessUnitUseCase } from './application/use-cases/get-products-by-business-unit.use-case';
import { GetProductByIdUseCase } from './application/use-cases/get-product-by-id.use-case';
import { CreateProductUseCase } from './application/use-cases/create-product.use-case';

@Module({
  controllers: [ProductsController],
  providers: [
    {
      provide: PRODUCT_REPOSITORY,
      useClass: PrismaProductRepository,
    },
    GetActiveProductsUseCase,
    GetProductsByBusinessUnitUseCase,
    GetProductByIdUseCase,
    CreateProductUseCase,
  ],
})
export class BusinessUnitsModule {}
