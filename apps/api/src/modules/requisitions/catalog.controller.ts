import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Header, Headers, HttpCode, Param, Patch, Post, Query, Res,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import { SUPPLY_ICONS } from '@rh/shared';
import { AllowDevice, Audit, CurrentActor, RequiresModule, Roles } from '../../common/decorators';
import { zbody } from '../../common/pipes/zod.pipe';
import type { Actor } from '../../common/actor';
import { isManager } from '../../common/actor';
import { CatalogService } from './catalog.service';
import { assertAreaAccess, deviceAreaId } from './access';
import { csvTemplate } from './requisitions.logic';
import { InjectDb, Db } from '../../db/db.module';
import {
  BulkAssignSchema, CategorySchema, CreateSupplySchema, ImportJsonSchema, ReorderSchema, ReorderSuppliesSchema, SupplierSchema,
  SupplyListQuery, UpdateCategorySchema, UpdateSupplierSchema, UpdateSupplySchema,
  zq,
} from './dto';

/** CAT-02 · Categorías de insumos */
@RequiresModule('requisitions')
@Controller('supply-categories')
export class SupplyCategoriesController {
  constructor(private readonly svc: CatalogService) {}

  @AllowDevice('AREA')
  @Get()
  list(@CurrentActor() a: Actor) {
    return this.svc.listCategories(a);
  }

  @Roles('ADMIN')
  @Post()
  @Audit('supply_category.create', 'supply_category')
  create(@CurrentActor() a: Actor, @Body(zbody(CategorySchema)) dto: z.infer<typeof CategorySchema>) {
    return this.svc.createCategory(a, dto);
  }

  @Roles('ADMIN')
  @Post('reorder')
  @HttpCode(200)
  reorder(@CurrentActor() a: Actor, @Body(zbody(ReorderSchema)) dto: z.infer<typeof ReorderSchema>) {
    return this.svc.reorderCategories(a, dto.ids);
  }

  @Roles('ADMIN')
  @Patch(':id')
  @Audit('supply_category.update', 'supply_category')
  update(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(UpdateCategorySchema)) dto: z.infer<typeof UpdateCategorySchema>) {
    return this.svc.updateCategory(a, id, dto);
  }

  @Roles('ADMIN')
  @Delete(':id')
  @Audit('supply_category.delete', 'supply_category')
  remove(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.deleteCategory(a, id);
  }
}

/** CAT-02 / ADM-06 · Proveedores */
@RequiresModule('requisitions')
@Roles('ADMIN')
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly svc: CatalogService) {}

  @Get()
  list(@CurrentActor() a: Actor) {
    return this.svc.listSuppliers(a);
  }

  @Get(':id')
  get(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.getSupplier(a, id);
  }

  @Post()
  @Audit('supplier.create', 'supplier')
  create(@CurrentActor() a: Actor, @Body(zbody(SupplierSchema)) dto: z.infer<typeof SupplierSchema>) {
    return this.svc.createSupplier(a, dto);
  }

  @Patch(':id')
  @Audit('supplier.update', 'supplier')
  update(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(UpdateSupplierSchema)) dto: z.infer<typeof UpdateSupplierSchema>) {
    return this.svc.updateSupplier(a, id, dto);
  }

  @Delete(':id')
  @Audit('supplier.delete', 'supplier')
  remove(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.deleteSupplier(a, id);
  }
}

/** CAT-02 / CAT-04 · Insumos */
@RequiresModule('requisitions')
@Roles('ADMIN')
@Controller('supplies')
export class SuppliesController {
  constructor(private readonly svc: CatalogService) {}

  @Get()
  list(@CurrentActor() a: Actor, @Query(zq(SupplyListQuery)) q: z.infer<typeof SupplyListQuery>) {
    return this.svc.listSupplies(a, q);
  }

  /** Biblioteca de íconos (CAT-03) para el selector del admin. */
  @Get('icons')
  icons() {
    return SUPPLY_ICONS;
  }

  @Get('import/template')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="plantilla_insumos.csv"')
  template() {
    return `﻿${csvTemplate()}`;
  }

  /** multipart (campo "file") o JSON { csv, dryRun? }. ?dryRun=1 valida sin guardar. */
  @Post('import')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  async import(
    @CurrentActor() a: Actor,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: unknown,
    @Query('dryRun') dryRunQ?: string,
  ) {
    let csv: string;
    let dryRun = dryRunQ === '1' || dryRunQ === 'true';
    if (file) {
      csv = file.buffer.toString('utf8');
    } else {
      const p = ImportJsonSchema.safeParse(body);
      if (!p.success) throw new BadRequestException('Adjunta un archivo CSV o envía { csv }');
      csv = p.data.csv;
      dryRun = dryRun || !!p.data.dryRun;
    }
    return this.svc.importCsv(a, csv, dryRun);
  }

  @Post('reorder')
  @HttpCode(200)
  reorder(@CurrentActor() a: Actor, @Body(zbody(ReorderSuppliesSchema)) dto: z.infer<typeof ReorderSuppliesSchema>) {
    return this.svc.reorderSupplies(a, dto.areaId, dto.ids);
  }

  @Post('bulk-assign')
  @HttpCode(200)
  @Audit('supply.bulk_assign', 'supply')
  bulkAssign(@CurrentActor() a: Actor, @Body(zbody(BulkAssignSchema)) dto: z.infer<typeof BulkAssignSchema>) {
    return this.svc.bulkAssign(a, dto);
  }

  @Get(':id')
  get(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.getSupply(a, id);
  }

  @Post()
  @Audit('supply.create', 'supply')
  create(@CurrentActor() a: Actor, @Body(zbody(CreateSupplySchema)) dto: z.infer<typeof CreateSupplySchema>) {
    return this.svc.createSupply(a, dto);
  }

  @Patch(':id')
  @Audit('supply.update', 'supply')
  update(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(UpdateSupplySchema)) dto: z.infer<typeof UpdateSupplySchema>) {
    return this.svc.updateSupply(a, id, dto);
  }

  @Delete(':id')
  @Audit('supply.delete', 'supply')
  remove(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.deleteSupply(a, id);
  }
}

const TabletCatalogQuery = z.object({ areaId: z.string().optional() });

/** Catálogo optimizado para la tablet del área (ETag / 304). */
@RequiresModule('requisitions')
@Controller('tablet')
export class TabletController {
  constructor(private readonly svc: CatalogService, @InjectDb() private readonly db: Db) {}

  @AllowDevice('AREA')
  @Get('catalog')
  async catalog(
    @CurrentActor() a: Actor,
    @Query(zq(TabletCatalogQuery)) q: z.infer<typeof TabletCatalogQuery>,
    @Headers('if-none-match') inm: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    let areaId: string | null = deviceAreaId(a);
    if (a.kind === 'device') {
      if (!areaId) throw new ForbiddenException('Esta tablet no está ligada a un área');
    } else {
      if (!q.areaId) throw new BadRequestException('Indica el área (?areaId=)');
      areaId = q.areaId;
      if (!isManager(a)) await assertAreaAccess(this.db, a, areaId);
    }
    const { etag, body } = await this.svc.tabletCatalog(a.businessId, areaId);
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, no-cache');
    if (inm && inm.split(',').map((s) => s.trim().replace(/^W\//, '')).includes(etag)) {
      res.status(304);
      return undefined;
    }
    return body;
  }
}
