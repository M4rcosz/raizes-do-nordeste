import { Module } from '@nestjs/common';
import { AuditModule } from '@modules/audit/audit.module';
import { PRODUCT_REPOSITORY } from './domain/repositories/product.repository';
import { PrismaProductRepository } from './infrastructure/persistence/prisma-product.repository';
import { ProductsController } from './infrastructure/http/controllers/products.controller';
import { GetActiveProductsUseCase } from './application/use-cases/get-active-products.use-case';
import { GetProductsByBusinessUnitUseCase } from './application/use-cases/get-products-by-business-unit.use-case';
import { GetProductByIdUseCase } from './application/use-cases/get-product-by-id.use-case';
import { CreateProductUseCase } from './application/use-cases/create-product.use-case';
import { SetProductActiveUseCase } from './application/use-cases/set-product-active.use-case';
import { UpdateProductUseCase } from './application/use-cases/update-product.use-case';
import { BUSINESS_UNIT_REPOSITORY } from './domain/repositories/business-unit.repository';
import { PrismaBusinessUnitRepository } from './infrastructure/persistence/prisma-business-unit.repository';
import { BusinessUnitsController } from './infrastructure/http/controllers/business-units.controller';
import { CreateBusinessUnitUseCase } from './application/use-cases/create-business-unit.use-case';
import { ListBusinessUnitsUseCase } from './application/use-cases/list-business-units.use-case';
import { GetBusinessUnitByIdUseCase } from './application/use-cases/get-business-unit-by-id.use-case';
import { SetBusinessUnitActiveUseCase } from './application/use-cases/set-business-unit-active.use-case';
import { MENU_ITEM_REPOSITORY } from './domain/repositories/menu-item.repository';
import { PrismaMenuItemRepository } from './infrastructure/persistence/prisma-menu-item.repository';
import { MenuItemsController } from './infrastructure/http/controllers/menu-items.controller';
import { GetMenuByBusinessUnitUseCase } from './application/use-cases/get-menu-by-business-unit.use-case';
import { GetMenuItemByIdUseCase } from './application/use-cases/get-menu-item-by-id.use-case';
import { AddMenuItemUseCase } from './application/use-cases/add-menu-item.use-case';
import { UpdateMenuItemUseCase } from './application/use-cases/update-menu-item.use-case';
import { DeactivateMenuItemUseCase } from './application/use-cases/deactivate-menu-item.use-case';
import { ActivateMenuItemUseCase } from './application/use-cases/activate-menu-item.use-case';
import { CATEGORY_REPOSITORY } from './domain/repositories/category.repository';
import { PrismaCategoryRepository } from './infrastructure/persistence/prisma-category.repository';
import { CategoriesController } from './infrastructure/http/controllers/categories.controller';
import { ListCategoriesUseCase } from './application/use-cases/list-categories.use-case';
import { GetCategoryByIdUseCase } from './application/use-cases/get-category-by-id.use-case';
import { CreateCategoryUseCase } from './application/use-cases/create-category.use-case';
import { UpdateCategoryUseCase } from './application/use-cases/update-category.use-case';

@Module({
  imports: [AuditModule],
  controllers: [
    ProductsController,
    BusinessUnitsController,
    MenuItemsController,
    CategoriesController,
  ],
  providers: [
    {
      provide: PRODUCT_REPOSITORY,
      useClass: PrismaProductRepository,
    },
    GetActiveProductsUseCase,
    GetProductsByBusinessUnitUseCase,
    GetProductByIdUseCase,
    CreateProductUseCase,
    SetProductActiveUseCase,
    UpdateProductUseCase,
    {
      provide: BUSINESS_UNIT_REPOSITORY,
      useClass: PrismaBusinessUnitRepository,
    },
    CreateBusinessUnitUseCase,
    ListBusinessUnitsUseCase,
    GetBusinessUnitByIdUseCase,
    SetBusinessUnitActiveUseCase,
    {
      provide: MENU_ITEM_REPOSITORY,
      useClass: PrismaMenuItemRepository,
    },
    GetMenuByBusinessUnitUseCase,
    GetMenuItemByIdUseCase,
    AddMenuItemUseCase,
    UpdateMenuItemUseCase,
    DeactivateMenuItemUseCase,
    ActivateMenuItemUseCase,
    {
      provide: CATEGORY_REPOSITORY,
      useClass: PrismaCategoryRepository,
    },
    ListCategoriesUseCase,
    GetCategoryByIdUseCase,
    CreateCategoryUseCase,
    UpdateCategoryUseCase,
  ],
})
export class BusinessUnitsModule {}
