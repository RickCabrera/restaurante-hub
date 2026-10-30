import { BadRequestException, Injectable } from '@nestjs/common';
import Papa from 'papaparse';
import PDFDocument from 'pdfkit';
import { and, desc, eq, gte, lt, sql, SQL } from 'drizzle-orm';
import { formatQty, RequisitionStatus, RequisitionStatusLabel, UnitLabel } from '@rh/shared';
import type { UnitCode } from '@rh/shared';
import type { ShoppingListTicketData } from '@rh/printing';
import { InjectDb, Db } from '../../db/db.module';
import { areas, auditLogs, requisitionItems, requisitions } from '../../db/schema';
import type { Actor } from '../../common/actor';
import { SettingsService } from '../../settings/settings.service';
import { decodeCursor, encodeCursor, fillDailySeries, localMidnightUtc, localParts, ShoppingGroup } from './requisitions.logic';
import { parseBoundary } from './requisitions.service';
import type { ReportQueryDto } from './dto';

export interface RequisitionReport {
  range: { from: string; to: string; timezone: string };
  totals: { requisitions: number; items: number; urgent: number };
  byStatus: Record<RequisitionStatus, number>;
  bySupply: { supplyId: string; name: string; unit: UnitCode; unitLabel: string; approvedQty: number; requestedQty: number; receivedQty: number; requisitions: number }[];
  byArea: { areaId: string; name: string; color: string; count: number; items: number; urgent: number; late: number }[];
  avgResponseMinutes: number | null;
  avgFulfillMinutes: number | null;
  differencesCount: number;
  lateCount: number;
  daily: { date: string; count: number }[];
}

@Injectable()
export class ReportsService {
  constructor(@InjectDb() private readonly db: Db, private readonly settings: SettingsService) {}

  private async range(actor: Actor, q: ReportQueryDto) {
    const tz = (await this.settings.getBusiness(actor.businessId)).timezone;
    const today = localParts(new Date(), tz).date;
    const to = q.to ?? today;
    const from = q.from ?? new Date(Date.parse(`${to}T12:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
    if (from > to) throw new BadRequestException('La fecha inicial es posterior a la final');
    if (Date.parse(to) - Date.parse(from) > 400 * 86_400_000) throw new BadRequestException('El periodo máximo es de 400 días');
    return { tz, from, to, fromTs: localMidnightUtc(from, tz), toTs: parseBoundary(to, tz, true) };
  }

  private where(actor: Actor, r: { fromTs: Date; toTs: Date }, areaId?: string): SQL {
    const c: SQL[] = [eq(requisitions.businessId, actor.businessId), gte(requisitions.createdAt, r.fromTs), lt(requisitions.createdAt, r.toTs)];
    if (areaId) c.push(eq(requisitions.areaId, areaId));
    return and(...c)!;
  }

  async requisitionsReport(actor: Actor, q: ReportQueryDto): Promise<RequisitionReport> {
    const r = await this.range(actor, q);
    const w = this.where(actor, r, q.areaId);

    const statusRows = await this.db.select({ status: requisitions.status, n: sql<number>`count(*)::int` }).from(requisitions).where(w).groupBy(requisitions.status);
    const byStatus = Object.fromEntries(Object.keys(RequisitionStatusLabel).map((s) => [s, 0])) as Record<RequisitionStatus, number>;
    for (const s of statusRows) byStatus[s.status] = s.n;

    const [agg] = await this.db
      .select({
        n: sql<number>`count(*)::int`,
        urgent: sql<number>`count(*) filter (where ${requisitions.priority} = 'URGENTE')::int`,
        late: sql<number>`count(*) filter (where ${requisitions.isLate})::int`,
        diffs: sql<number>`count(*) filter (where ${requisitions.hasDifferences})::int`,
        resp: sql<number | null>`avg(extract(epoch from (${requisitions.reviewedAt} - ${requisitions.createdAt})) / 60) filter (where ${requisitions.reviewedAt} is not null and ${requisitions.reviewedById} <> 'SYSTEM')`,
        fulfill: sql<number | null>`avg(extract(epoch from (${requisitions.fulfilledAt} - coalesce(${requisitions.reviewedAt}, ${requisitions.createdAt}))) / 60) filter (where ${requisitions.fulfilledAt} is not null)`,
      })
      .from(requisitions)
      .where(w);

    const supplyRows = await this.db
      .select({
        supplyId: requisitionItems.supplyId,
        name: sql<string>`max(${requisitionItems.supplyName})`,
        unit: requisitionItems.unit,
        approvedQty: sql<number>`coalesce(sum(${requisitionItems.approvedQty}), 0)::float8`,
        requestedQty: sql<number>`coalesce(sum(${requisitionItems.requestedQty}), 0)::float8`,
        receivedQty: sql<number>`coalesce(sum(${requisitionItems.receivedQty}), 0)::float8`,
        requisitions: sql<number>`count(distinct ${requisitionItems.requisitionId})::int`,
      })
      .from(requisitionItems)
      .innerJoin(requisitions, eq(requisitions.id, requisitionItems.requisitionId))
      .where(and(w, sql`${requisitions.status} not in ('CANCELADA', 'RECHAZADA')`))
      .groupBy(requisitionItems.supplyId, requisitionItems.unit)
      .orderBy(sql`4 desc`, sql`5 desc`)
      .limit(20);

    const itemsCount = this.db
      .select({ rid: requisitionItems.requisitionId, n: sql<number>`count(*)::int`.as('n') })
      .from(requisitionItems)
      .groupBy(requisitionItems.requisitionId)
      .as('ic');
    const areaRows = await this.db
      .select({
        areaId: areas.id, name: areas.name, color: areas.color,
        count: sql<number>`count(*)::int`,
        items: sql<number>`coalesce(sum(${itemsCount.n}), 0)::int`,
        urgent: sql<number>`count(*) filter (where ${requisitions.priority} = 'URGENTE')::int`,
        late: sql<number>`count(*) filter (where ${requisitions.isLate})::int`,
      })
      .from(requisitions)
      .innerJoin(areas, eq(areas.id, requisitions.areaId))
      .leftJoin(itemsCount, eq(itemsCount.rid, requisitions.id))
      .where(w)
      .groupBy(areas.id, areas.name, areas.color, areas.sortOrder)
      .orderBy(areas.sortOrder);

    const day = sql<string>`to_char(${requisitions.createdAt} at time zone ${r.tz}, 'YYYY-MM-DD')`;
    const dailyRows = await this.db.select({ date: day, count: sql<number>`count(*)::int` }).from(requisitions).where(w).groupBy(sql`1`);
    const [{ items }] = await this.db
      .select({ items: sql<number>`count(*)::int` })
      .from(requisitionItems)
      .innerJoin(requisitions, eq(requisitions.id, requisitionItems.requisitionId))
      .where(w);

    const round1 = (v: number | null | string) => (v == null ? null : Math.round(Number(v) * 10) / 10);
    return {
      range: { from: r.from, to: r.to, timezone: r.tz },
      totals: { requisitions: agg.n, items, urgent: agg.urgent },
      byStatus,
      bySupply: supplyRows.map((s) => ({
        ...s, approvedQty: Number(s.approvedQty), requestedQty: Number(s.requestedQty), receivedQty: Number(s.receivedQty), unitLabel: UnitLabel[s.unit]?.short ?? s.unit,
      })),
      byArea: areaRows,
      avgResponseMinutes: round1(agg.resp),
      avgFulfillMinutes: round1(agg.fulfill),
      differencesCount: agg.diffs,
      lateCount: agg.late,
      daily: fillDailySeries(r.from, r.to, dailyRows),
    };
  }

  /** CSV de detalle por renglón (abre bien en Excel: BOM + CRLF). */
  async requisitionsCsv(actor: Actor, q: ReportQueryDto): Promise<{ filename: string; csv: string }> {
    const r = await this.range(actor, q);
    const rows = await this.db
      .select({
        folio: requisitions.folio, createdAt: requisitions.createdAt, area: areas.name, status: requisitions.status, priority: requisitions.priority,
        createdByName: requisitions.createdByName, isLate: requisitions.isLate, supply: requisitionItems.supplyName, unit: requisitionItems.unit,
        requested: requisitionItems.requestedQty, approved: requisitionItems.approvedQty, fulfilled: requisitionItems.fulfilledQty,
        received: requisitionItems.receivedQty, rejected: requisitionItems.rejected, note: requisitionItems.note,
      })
      .from(requisitionItems)
      .innerJoin(requisitions, eq(requisitions.id, requisitionItems.requisitionId))
      .innerJoin(areas, eq(areas.id, requisitions.areaId))
      .where(this.where(actor, r, q.areaId))
      .orderBy(requisitions.createdAt, requisitionItems.supplyName);
    const fmt = new Intl.DateTimeFormat('es-MX', { timeZone: r.tz, dateStyle: 'short', timeStyle: 'short' });
    const n = (v: number | null) => (v == null ? '' : formatQty(v));
    const csv = Papa.unparse({
      fields: ['Folio', 'Fecha', 'Área', 'Estado', 'Prioridad', 'Pidió', 'Tarde', 'Insumo', 'Unidad', 'Pedido', 'Aprobado', 'Surtido', 'Recibido', 'Rechazado', 'Nota'],
      data: rows.map((x) => [
        x.folio, fmt.format(x.createdAt), x.area, RequisitionStatusLabel[x.status], x.priority === 'URGENTE' ? 'Urgente' : 'Normal', x.createdByName ?? '',
        x.isLate ? 'Sí' : 'No', x.supply, UnitLabel[x.unit]?.short ?? x.unit, n(x.requested), n(x.approved), n(x.fulfilled), n(x.received),
        x.rejected ? 'Sí' : 'No', x.note ?? '',
      ]),
    }, { newline: '\r\n' });
    return { filename: `requisiciones_${r.from}_${r.to}.csv`, csv: `﻿${csv}\r\n` };
  }

  // -------------------------------------------------------------- bitácora
  async auditLogs(actor: Actor, q: { entity?: string; entityId?: string; actorId?: string; action?: string; from?: string; to?: string; cursor?: string; limit: number }) {
    const tz = (await this.settings.getBusiness(actor.businessId)).timezone;
    const c: SQL[] = [eq(auditLogs.businessId, actor.businessId)];
    if (q.entity) c.push(eq(auditLogs.entity, q.entity));
    if (q.entityId) c.push(eq(auditLogs.entityId, q.entityId));
    if (q.actorId) c.push(eq(auditLogs.actorId, q.actorId));
    if (q.action) c.push(sql`${auditLogs.action} like ${`${q.action}%`}`);
    if (q.from) c.push(gte(auditLogs.createdAt, parseBoundary(q.from, tz, false)));
    if (q.to) c.push(lt(auditLogs.createdAt, parseBoundary(q.to, tz, true)));
    const cur = decodeCursor(q.cursor);
    if (q.cursor && !cur) throw new BadRequestException('Cursor inválido');
    const ms = sql`date_trunc('milliseconds', ${auditLogs.createdAt})`;
    if (cur) c.push(sql`(${ms}, ${auditLogs.id}) < (${cur.createdAt.toISOString()}::timestamptz, ${cur.id})`);
    const rows = await this.db.select().from(auditLogs).where(and(...c)).orderBy(desc(ms), desc(auditLogs.id)).limit(q.limit + 1);
    const items = rows.slice(0, q.limit);
    const last = items[items.length - 1];
    return { items, nextCursor: rows.length > q.limit && last ? encodeCursor(last.createdAt, last.id) : null };
  }

  // -------------------------------------------------------------- lista de compras: impresión y PDF
  toTicketData(businessName: string, groups: ShoppingGroup[], at = new Date()): ShoppingListTicketData {
    return {
      businessName,
      createdAt: at.toISOString(),
      groups: groups.map((g) => ({
        supplierName: g.supplierName,
        items: g.items.map((i) => ({ name: i.supplyName, quantity: formatQty(i.quantity), unit: i.unitLabel })),
      })),
    };
  }

  async shoppingPdf(businessName: string, timezone: string, groups: ShoppingGroup[]): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'LETTER', margin: 48, info: { Title: 'Lista de compras', Author: businessName } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
    const fecha = new Intl.DateTimeFormat('es-MX', { timeZone: timezone, dateStyle: 'full', timeStyle: 'short' }).format(new Date());
    doc.font('Helvetica-Bold').fontSize(20).text('Lista de compras');
    doc.font('Helvetica').fontSize(11).fillColor('#555').text(`${businessName} · ${fecha}`).fillColor('#000');
    doc.moveDown();
    if (!groups.length) doc.fontSize(12).text('No hay insumos pendientes de comprar.');
    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    for (const g of groups) {
      if (doc.y > doc.page.height - 140) doc.addPage();
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(14).text(g.supplierName, left, doc.y, { continued: !!g.phone });
      if (g.phone) doc.font('Helvetica').fontSize(10).fillColor('#555').text(`   Tel. ${g.phone}`).fillColor('#000');
      doc.moveTo(left, doc.y + 2).lineTo(left + width, doc.y + 2).strokeColor('#999').stroke();
      doc.moveDown(0.4);
      for (const it of g.items) {
        if (doc.y > doc.page.height - 72) doc.addPage();
        const y = doc.y;
        doc.rect(left, y + 1, 10, 10).strokeColor('#000').stroke();
        doc.font('Helvetica-Bold').fontSize(11).text(`${formatQty(it.quantity)} ${it.unitLabel}`, left + 18, y, { width: 80 });
        doc.font('Helvetica').fontSize(11).text(it.supplyName, left + 100, y, { width: width - 100 });
        const src = it.sources.map((s) => `${s.folio} ${s.areaName}`).join(', ');
        doc.fontSize(8).fillColor('#666').text(src, left + 100, doc.y, { width: width - 100 }).fillColor('#000');
        doc.moveDown(0.3);
      }
    }
    doc.end();
    return done;
  }
}
