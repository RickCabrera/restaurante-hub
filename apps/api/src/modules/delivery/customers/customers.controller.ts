import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Audit, CurrentActor, RequiresModule, Roles } from '../../../common/decorators';
import { zbody } from '../../../common/pipes/zod.pipe';
import type { Actor } from '../../../common/actor';
import { AddressPatchSchema, AddressSchema, CustomerListSchema, CustomerPatchSchema } from '../common/dto';
import { CustomersService } from './customers.service';

@RequiresModule('delivery')
@Roles('ADMIN', 'CASHIER')
@Controller('customers')
export class CustomersController {
  constructor(private readonly svc: CustomersService) {}

  @Get()
  list(@CurrentActor() a: Actor, @Query(zbody(CustomerListSchema)) q: z.infer<typeof CustomerListSchema>) {
    return this.svc.list(a.businessId, q);
  }

  /** Búsqueda exacta por teléfono (captura manual) */
  @Get('by-phone/:phone')
  async byPhone(@CurrentActor() a: Actor, @Param('phone') phone: string) {
    const c = await this.svc.findByPhone(a.businessId, phone);
    return c ? this.svc.get(a.businessId, c.id) : null;
  }

  @Get(':id')
  get(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.get(a.businessId, id);
  }

  @Patch(':id')
  @Audit('customer.update', 'customer')
  update(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(CustomerPatchSchema)) dto: z.infer<typeof CustomerPatchSchema>) {
    return this.svc.update(a.businessId, id, dto);
  }

  @Get(':id/addresses')
  addresses(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.listAddresses(a.businessId, id);
  }

  @Post(':id/addresses')
  addAddress(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(AddressSchema)) dto: z.infer<typeof AddressSchema>) {
    return this.svc.addAddress(a.businessId, id, dto);
  }

  @Patch(':id/addresses/:addressId')
  updateAddress(
    @CurrentActor() a: Actor,
    @Param('id') id: string,
    @Param('addressId') addressId: string,
    @Body(zbody(AddressPatchSchema)) dto: z.infer<typeof AddressPatchSchema>,
  ) {
    return this.svc.updateAddress(a.businessId, id, addressId, dto);
  }

  @Delete(':id/addresses/:addressId')
  deleteAddress(@CurrentActor() a: Actor, @Param('id') id: string, @Param('addressId') addressId: string) {
    return this.svc.deleteAddress(a.businessId, id, addressId);
  }
}
