import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { AllowDevice, Audit, CurrentActor, RequiresModule, Roles } from '../../../common/decorators';
import { zbody } from '../../../common/pipes/zod.pipe';
import type { Actor } from '../../../common/actor';
import {
  AvailabilitySchema, BranchOverrideSchema, CategorySchema, MenuQuerySchema, ModifierGroupPatchSchema, ModifierGroupSchema,
  ModifierSchema, ProductPatchSchema, ProductSchema, ReorderSchema,
} from '../common/dto';
import { MenuService } from './menu.service';

const CategoryPatch = CategorySchema.partial();
const ModifierPatch = ModifierSchema.partial();

@RequiresModule('delivery')
@Controller('menu')
export class MenuController {
  constructor(private readonly svc: MenuService) {}

  /** Menú armado por canal (POS, captura manual, vista previa) */
  @AllowDevice('POS', 'KDS')
  @Get()
  menu(@CurrentActor() a: Actor, @Query(zbody(MenuQuerySchema)) q: z.infer<typeof MenuQuerySchema>) {
    return this.svc.getMenu(a.businessId, q);
  }

  // ---------------- categorías
  @Get('categories')
  categories(@CurrentActor() a: Actor) {
    return this.svc.listCategories(a.businessId);
  }

  @Roles('ADMIN')
  @Post('categories')
  @Audit('menu.category.create', 'menu_category')
  createCategory(@CurrentActor() a: Actor, @Body(zbody(CategorySchema)) dto: z.infer<typeof CategorySchema>) {
    return this.svc.createCategory(a.businessId, dto);
  }

  @Roles('ADMIN')
  @Put('categories/reorder')
  reorderCategories(@CurrentActor() a: Actor, @Body(zbody(ReorderSchema)) dto: z.infer<typeof ReorderSchema>) {
    return this.svc.reorderCategories(a.businessId, dto.ids);
  }

  @Roles('ADMIN')
  @Patch('categories/:id')
  @Audit('menu.category.update', 'menu_category')
  updateCategory(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(CategoryPatch)) dto: z.infer<typeof CategoryPatch>) {
    return this.svc.updateCategory(a.businessId, id, dto);
  }

  @Roles('ADMIN')
  @Delete('categories/:id')
  @Audit('menu.category.delete', 'menu_category')
  deleteCategory(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.deleteCategory(a.businessId, id);
  }

  // ---------------- productos
  @Get('products')
  products(@CurrentActor() a: Actor, @Query('categoryId') categoryId?: string) {
    return this.svc.listProducts(a.businessId, categoryId);
  }

  @Roles('ADMIN')
  @Post('products')
  @Audit('menu.product.create', 'product')
  createProduct(@CurrentActor() a: Actor, @Body(zbody(ProductSchema)) dto: z.infer<typeof ProductSchema>) {
    return this.svc.createProduct(a.businessId, dto);
  }

  @Roles('ADMIN')
  @Put('products/reorder')
  reorderProducts(@CurrentActor() a: Actor, @Body(zbody(ReorderSchema)) dto: z.infer<typeof ReorderSchema>) {
    return this.svc.reorderProducts(a.businessId, dto.ids);
  }

  @Get('products/:id')
  product(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.getProduct(a.businessId, id);
  }

  @Roles('ADMIN')
  @Patch('products/:id')
  @Audit('menu.product.update', 'product')
  updateProduct(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(ProductPatchSchema)) dto: z.infer<typeof ProductPatchSchema>) {
    return this.svc.updateProduct(a.businessId, id, dto);
  }

  @Roles('ADMIN')
  @Delete('products/:id')
  @Audit('menu.product.delete', 'product')
  deleteProduct(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.deleteProduct(a.businessId, id);
  }

  /** "Agotado" rápido */
  @Roles('ADMIN', 'CASHIER', 'AREA_LEAD')
  @Patch('products/:id/availability')
  @Audit('menu.product.availability', 'product')
  availability(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(AvailabilitySchema)) dto: z.infer<typeof AvailabilitySchema>) {
    return this.svc.setProductAvailability(a.businessId, id, dto.available);
  }

  @Roles('ADMIN')
  @Put('products/:id/branches/:branchId')
  @Audit('menu.product.branch', 'product')
  branchOverride(
    @CurrentActor() a: Actor,
    @Param('id') id: string,
    @Param('branchId') branchId: string,
    @Body(zbody(BranchOverrideSchema)) dto: z.infer<typeof BranchOverrideSchema>,
  ) {
    return this.svc.setBranchOverride(a.businessId, id, branchId, dto);
  }

  // ---------------- grupos de modificadores
  @Get('modifier-groups')
  groups(@CurrentActor() a: Actor) {
    return this.svc.listGroups(a.businessId);
  }

  @Roles('ADMIN')
  @Post('modifier-groups')
  @Audit('menu.modifier_group.create', 'modifier_group')
  createGroup(@CurrentActor() a: Actor, @Body(zbody(ModifierGroupSchema)) dto: z.infer<typeof ModifierGroupSchema>) {
    return this.svc.createGroup(a.businessId, dto);
  }

  @Roles('ADMIN')
  @Put('modifier-groups/reorder')
  reorderGroups(@CurrentActor() a: Actor, @Body(zbody(ReorderSchema)) dto: z.infer<typeof ReorderSchema>) {
    return this.svc.reorderGroups(a.businessId, dto.ids);
  }

  @Get('modifier-groups/:id')
  group(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.getGroup(a.businessId, id);
  }

  @Roles('ADMIN')
  @Patch('modifier-groups/:id')
  @Audit('menu.modifier_group.update', 'modifier_group')
  updateGroup(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(ModifierGroupPatchSchema)) dto: z.infer<typeof ModifierGroupPatchSchema>) {
    return this.svc.updateGroup(a.businessId, id, dto);
  }

  @Roles('ADMIN')
  @Delete('modifier-groups/:id')
  @Audit('menu.modifier_group.delete', 'modifier_group')
  deleteGroup(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.deleteGroup(a.businessId, id);
  }

  @Roles('ADMIN')
  @Post('modifier-groups/:id/modifiers')
  @Audit('menu.modifier.create', 'modifier')
  addModifier(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(ModifierSchema)) dto: z.infer<typeof ModifierSchema>) {
    return this.svc.addModifier(a.businessId, id, dto);
  }

  @Roles('ADMIN')
  @Put('modifier-groups/:id/modifiers/reorder')
  reorderModifiers(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(ReorderSchema)) dto: z.infer<typeof ReorderSchema>) {
    return this.svc.reorderModifiers(a.businessId, id, dto.ids);
  }

  @Roles('ADMIN')
  @Patch('modifier-groups/:id/modifiers/:modifierId')
  @Audit('menu.modifier.update', 'modifier')
  updateModifier(
    @CurrentActor() a: Actor,
    @Param('id') id: string,
    @Param('modifierId') modifierId: string,
    @Body(zbody(ModifierPatch)) dto: z.infer<typeof ModifierPatch>,
  ) {
    return this.svc.updateModifier(a.businessId, id, modifierId, dto);
  }

  /** "Agotado" rápido de una opción */
  @Roles('ADMIN', 'CASHIER', 'AREA_LEAD')
  @Patch('modifier-groups/:id/modifiers/:modifierId/availability')
  @Audit('menu.modifier.availability', 'modifier')
  modifierAvailability(
    @CurrentActor() a: Actor,
    @Param('id') id: string,
    @Param('modifierId') modifierId: string,
    @Body(zbody(AvailabilitySchema)) dto: z.infer<typeof AvailabilitySchema>,
  ) {
    return this.svc.updateModifier(a.businessId, id, modifierId, { available: dto.available });
  }

  @Roles('ADMIN')
  @Delete('modifier-groups/:id/modifiers/:modifierId')
  @Audit('menu.modifier.delete', 'modifier')
  deleteModifier(@CurrentActor() a: Actor, @Param('id') id: string, @Param('modifierId') modifierId: string) {
    return this.svc.deleteModifier(a.businessId, id, modifierId);
  }
}
