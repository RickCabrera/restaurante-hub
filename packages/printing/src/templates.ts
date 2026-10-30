import { PrintBlock, PrintDocument } from './document';
import {
  BillTicketData, CashCutTicketData, CustomerTicketData, KitchenTicketData,
  ShoppingListTicketData, TestTicketData, TicketBusinessInfo, TicketLine,
} from './templates.types';

const money = (c: number) =>
  '$' + (c / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

function header(b: TicketBusinessInfo): PrintBlock[] {
  const out: PrintBlock[] = [];
  if (b.logoUrl) out.push({ type: 'image', url: b.logoUrl, width: 200 });
  out.push({ type: 'text', text: b.name, align: 'center', bold: true, size: 2 });
  if (b.address) out.push({ type: 'text', text: b.address, align: 'center' });
  if (b.phone) out.push({ type: 'text', text: `Tel. ${b.phone}`, align: 'center' });
  out.push({ type: 'line' });
  return out;
}

function pricedLines(lines: TicketLine[]): PrintBlock[] {
  const out: PrintBlock[] = [];
  for (const l of lines) {
    out.push({ type: 'row', left: `${l.quantity} x ${l.name}`, right: l.totalCents != null ? money(l.totalCents) : '' });
    for (const m of l.modifiers ?? []) {
      const extra = m.priceCents ? ` (+${money(m.priceCents * (m.quantity ?? 1))})` : '';
      out.push({ type: 'text', text: `   + ${m.quantity && m.quantity > 1 ? m.quantity + ' ' : ''}${m.name}${extra}` });
    }
    if (l.note) out.push({ type: 'text', text: `   * ${l.note}` });
  }
  return out;
}

export function buildKitchenTicket(d: KitchenTicketData, paperWidth: 58 | 80 = 80): PrintDocument {
  const blocks: PrintBlock[] = [{ type: 'beep', times: 2 }];
  if (d.isReprint) blocks.push({ type: 'text', text: '*** REIMPRESIÓN ***', align: 'center', bold: true });
  if (d.isAddition) blocks.push({ type: 'text', text: '+++ AGREGADO +++', align: 'center', bold: true, invert: true });
  if (d.urgent) blocks.push({ type: 'text', text: '!!! URGENTE !!!', align: 'center', bold: true, invert: true });
  blocks.push(
    { type: 'text', text: d.areaName.toUpperCase(), align: 'center', bold: true, size: 2 },
    { type: 'text', text: d.folio, align: 'center', bold: true, size: 3 },
    { type: 'text', text: d.serviceLabel, align: 'center', bold: true, size: 2 },
    { type: 'text', text: fmtDate(d.createdAt), align: 'center' },
  );
  if (d.customerName) blocks.push({ type: 'text', text: `Cliente: ${d.customerName}` });
  if (d.waiterName) blocks.push({ type: 'text', text: `Mesero: ${d.waiterName}` });
  blocks.push({ type: 'line' });
  for (const l of d.lines) {
    blocks.push({ type: 'text', text: `${l.quantity}  ${l.name}`, bold: true, size: 2 });
    for (const m of l.modifiers ?? []) {
      blocks.push({ type: 'text', text: `    + ${m.quantity && m.quantity > 1 ? m.quantity + ' ' : ''}${m.name}`, size: 1, bold: true });
    }
    if (l.note) blocks.push({ type: 'text', text: `    >> ${l.note}`, bold: true, underline: true });
  }
  blocks.push({ type: 'line' });
  if (d.notes) blocks.push({ type: 'text', text: `NOTA: ${d.notes}`, bold: true });
  blocks.push({ type: 'feed', lines: 3 }, { type: 'cut' });
  return { title: `Comanda ${d.folio} ${d.areaName}`, paperWidth, blocks };
}

export function buildCustomerTicket(d: CustomerTicketData, paperWidth: 58 | 80 = 80): PrintDocument {
  const blocks: PrintBlock[] = [
    ...header(d.business),
    { type: 'text', text: `PEDIDO ${d.folio}`, align: 'center', bold: true, size: 2 },
    { type: 'text', text: `${d.typeLabel} · ${d.channelLabel}`, align: 'center', bold: true },
    { type: 'text', text: fmtDate(d.createdAt), align: 'center' },
    { type: 'line' },
    { type: 'text', text: d.customerName, bold: true },
    { type: 'text', text: `Tel: ${d.customerPhone}` },
  ];
  if (d.address) blocks.push({ type: 'text', text: d.address, bold: true });
  if (d.references) blocks.push({ type: 'text', text: `Ref: ${d.references}` });
  if (d.driverName) blocks.push({ type: 'text', text: `Repartidor: ${d.driverName}` });
  blocks.push({ type: 'line' }, ...pricedLines(d.lines), { type: 'line' });
  blocks.push({ type: 'row', left: 'Subtotal', right: money(d.subtotalCents) });
  if (d.discountCents) blocks.push({ type: 'row', left: 'Descuento', right: '-' + money(d.discountCents) });
  if (d.deliveryFeeCents) blocks.push({ type: 'row', left: 'Envío', right: money(d.deliveryFeeCents) });
  blocks.push({ type: 'row', left: 'TOTAL', right: money(d.totalCents), bold: true, size: 2 });
  blocks.push({ type: 'text', text: `Pago: ${d.paymentLabel}`, bold: true });
  if (d.cashGivenCents) {
    blocks.push({ type: 'row', left: 'Paga con', right: money(d.cashGivenCents) });
    blocks.push({ type: 'row', left: 'Cambio', right: money(d.changeCents ?? d.cashGivenCents - d.totalCents), bold: true });
  }
  if (d.notes) blocks.push({ type: 'line' }, { type: 'text', text: `Notas: ${d.notes}` });
  if (d.mapsUrl) {
    blocks.push({ type: 'line' }, { type: 'text', text: 'Ubicación', align: 'center' }, { type: 'qr', data: d.mapsUrl, size: 6, align: 'center' });
  }
  if (d.business.footer) blocks.push({ type: 'feed' }, { type: 'text', text: d.business.footer, align: 'center' });
  blocks.push({ type: 'feed', lines: 3 }, { type: 'cut' });
  return { title: `Ticket ${d.folio}`, paperWidth, blocks };
}

export function buildBillTicket(d: BillTicketData, paperWidth: 58 | 80 = 80, openDrawer = false): PrintDocument {
  const blocks: PrintBlock[] = [
    ...header(d.business),
    { type: 'text', text: d.isPaid ? 'COMPROBANTE DE PAGO' : 'CUENTA', align: 'center', bold: true, size: 2 },
    { type: 'row', left: d.tableLabel, right: d.folio, bold: true },
    { type: 'text', text: fmtDate(d.createdAt) },
  ];
  if (d.waiterName) blocks.push({ type: 'text', text: `Atendió: ${d.waiterName}` });
  if (d.guests) blocks.push({ type: 'text', text: `Personas: ${d.guests}` });
  blocks.push({ type: 'line' }, ...pricedLines(d.lines), { type: 'line' });
  blocks.push({ type: 'row', left: 'Subtotal', right: money(d.subtotalCents) });
  if (d.discountCents) blocks.push({ type: 'row', left: 'Descuento', right: '-' + money(d.discountCents) });
  if (d.tipCents) blocks.push({ type: 'row', left: 'Propina', right: money(d.tipCents) });
  blocks.push({ type: 'row', left: 'TOTAL', right: money(d.totalCents), bold: true, size: 2 });
  if (d.payments?.length) {
    blocks.push({ type: 'line' });
    for (const p of d.payments) {
      blocks.push({ type: 'row', left: p.label, right: money(p.amountCents) });
      if (p.receivedCents) blocks.push({ type: 'row', left: '  Recibido', right: money(p.receivedCents) });
      if (p.changeCents) blocks.push({ type: 'row', left: '  Cambio', right: money(p.changeCents) });
    }
  }
  if (!d.isPaid && d.suggestedTips?.length) {
    blocks.push({ type: 'line' }, { type: 'text', text: 'Propina sugerida', align: 'center' });
    for (const t of d.suggestedTips) blocks.push({ type: 'row', left: `${t.percent}%`, right: money(t.amountCents) });
  }
  if (d.business.footer) blocks.push({ type: 'feed' }, { type: 'text', text: d.business.footer, align: 'center' });
  blocks.push({ type: 'feed', lines: 3 }, { type: 'cut' });
  if (openDrawer) blocks.push({ type: 'drawer' });
  return { title: `Cuenta ${d.folio}`, paperWidth, blocks };
}

export function buildCashCutTicket(d: CashCutTicketData, paperWidth: 58 | 80 = 80): PrintDocument {
  const blocks: PrintBlock[] = [
    ...header(d.business),
    { type: 'text', text: d.kind === 'Z' ? 'CORTE Z (CIERRE)' : 'CORTE X (PARCIAL)', align: 'center', bold: true, size: 2 },
    { type: 'text', text: `Caja ${d.sessionFolio} · ${d.cashierName}` },
    { type: 'text', text: `Apertura: ${fmtDate(d.openedAt)}` },
  ];
  if (d.closedAt) blocks.push({ type: 'text', text: `Cierre: ${fmtDate(d.closedAt)}` });
  blocks.push({ type: 'line' }, { type: 'row', left: 'Fondo inicial', right: money(d.openingCents) });
  blocks.push({ type: 'text', text: 'VENTAS POR MÉTODO', bold: true });
  for (const s of d.salesByMethod) blocks.push({ type: 'row', left: `${s.label} (${s.count})`, right: money(s.amountCents) });
  blocks.push({ type: 'row', left: 'Propinas', right: money(d.tipsCents) });
  if (d.movements.length) {
    blocks.push({ type: 'text', text: 'MOVIMIENTOS', bold: true });
    for (const m of d.movements) blocks.push({ type: 'row', left: m.label, right: money(m.amountCents) });
  }
  blocks.push({ type: 'line' }, { type: 'row', left: 'Efectivo esperado', right: money(d.expectedCashCents), bold: true });
  if (d.countedCashCents != null) {
    blocks.push({ type: 'row', left: 'Efectivo contado', right: money(d.countedCashCents) });
    blocks.push({ type: 'row', left: 'Diferencia', right: money(d.differenceCents ?? 0), bold: true });
  }
  blocks.push(
    { type: 'row', left: 'Cuentas cobradas', right: String(d.ticketsCount) },
    { type: 'row', left: 'Cancelaciones', right: String(d.cancelledCount) },
    { type: 'feed', lines: 2 },
    { type: 'text', text: '______________________', align: 'center' },
    { type: 'text', text: 'Firma', align: 'center' },
    { type: 'feed', lines: 3 },
    { type: 'cut' },
  );
  return { title: `Corte ${d.kind} ${d.sessionFolio}`, paperWidth, blocks };
}

export function buildShoppingListTicket(d: ShoppingListTicketData, paperWidth: 58 | 80 = 80): PrintDocument {
  const blocks: PrintBlock[] = [
    { type: 'text', text: d.businessName, align: 'center', bold: true },
    { type: 'text', text: 'LISTA DE COMPRAS', align: 'center', bold: true, size: 2 },
    { type: 'text', text: fmtDate(d.createdAt), align: 'center' },
  ];
  for (const g of d.groups) {
    blocks.push({ type: 'line' }, { type: 'text', text: g.supplierName, bold: true, size: 2 });
    for (const i of g.items) blocks.push({ type: 'row', left: `[ ] ${i.name}`, right: `${i.quantity} ${i.unit}` });
  }
  blocks.push({ type: 'feed', lines: 3 }, { type: 'cut' });
  return { title: 'Lista de compras', paperWidth, blocks };
}

export function buildTestTicket(d: TestTicketData): PrintDocument {
  return {
    title: `Prueba ${d.printerName}`,
    paperWidth: d.paperWidth,
    blocks: [
      { type: 'text', text: 'PRUEBA DE IMPRESIÓN', align: 'center', bold: true, size: 2 },
      { type: 'text', text: d.printerName, align: 'center', bold: true },
      { type: 'text', text: d.connectionLabel, align: 'center' },
      { type: 'text', text: `Papel ${d.paperWidth} mm`, align: 'center' },
      { type: 'text', text: fmtDate(d.createdAt), align: 'center' },
      { type: 'line' },
      { type: 'text', text: 'Normal · ñ á é í ó ú ü ¿ ¡' },
      { type: 'text', text: 'Negritas', bold: true },
      { type: 'text', text: 'Grande', size: 2 },
      { type: 'row', left: 'Izquierda', right: 'Derecha' },
      { type: 'qr', data: 'https://example.com', align: 'center' },
      { type: 'feed', lines: 3 },
      { type: 'cut' },
    ],
  };
}
