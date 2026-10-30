// Registro de módulos de negocio.
// Módulo A (requisiciones) · Módulo B (delivery + WhatsApp) · Impresión/KDS · Módulo C (POS opcional)
import type { Type } from '@nestjs/common';
import { RequisitionsModule } from './modules/requisitions/requisitions.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { PrintingModule } from './modules/printing/printing.module';
import { PosModule } from './modules/pos/pos.module';

export const FEATURE_MODULES: Type<unknown>[] = [RequisitionsModule, DeliveryModule, WhatsappModule, PrintingModule, PosModule];
