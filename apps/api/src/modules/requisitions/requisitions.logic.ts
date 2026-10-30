// Lógica pura del módulo de requisiciones (sin Nest ni BD) para poder probarla con Jest.
import { createHash } from 'node:crypto';
import {
  canTransitionRequisition, formatQty, REQUISITION_TRANSITIONS, RequisitionStatus, RequisitionStatusLabel,
  roundQty, SUPPLY_ICON_KEYS, UnitCode, UnitLabel,
} from '@rh/shared';
import type { RequisitionActor } from '@rh/shared';

export type Side = RequisitionActor; // 'AREA' | 'MANAGER'

// ------------------------------------------------------------------ transiciones

/** Devuelve un mensaje de error en español si la transición no es válida para ese lado; null si es válida. */
export function transitionError(from: RequisitionStatus, to: RequisitionStatus, side: Side): string | null {
  if (canTransitionRequisition(from, to, side)) return null;
  const allowed = REQUISITION_TRANSITIONS[from]?.[to];
  if (allowed && allowed.length) {
    return side === 'AREA'
      ? `Solo la dueña puede marcar la requisición como «${RequisitionStatusLabel[to]}»`
      : `Solo el área puede marcar la requisición como «${RequisitionStatusLabel[to]}»`;
  }
  return `No se puede cambiar una requisición «${RequisitionStatusLabel[from]}» a «${RequisitionStatusLabel[to]}»`;
}

// ------------------------------------------------------------------ renglones

export interface IncomingItem {
  supplyId: string;
  quantity: number;
  note?: string | null;
}

/** Une renglones repetidos del mismo insumo (suma cantidades, junta notas) y redondea. */
export function normalizeIncomingItems(items: IncomingItem[]): IncomingItem[] {
  const map = new Map<string, IncomingItem>();
  for (const it of items) {
    const prev = map.get(it.supplyId);
    if (prev) {
      prev.quantity = roundQty(prev.quantity + it.quantity);
      prev.note = joinNotes(prev.note, it.note);
    } else {
      map.set(it.supplyId, { supplyId: it.supplyId, quantity: roundQty(it.quantity), note: it.note?.trim() || null });
    }
  }
  return [...map.values()];
}

export function joinNotes(a?: string | null, b?: string | null): string | null {
  const parts = [a, b].map((x) => x?.trim()).filter((x): x is string => !!x);
  if (!parts.length) return null;
  return [...new Set(parts)].join(' · ').slice(0, 500);
}

export interface ExistingItem {
  id: string;
  supplyId: string;
  requestedQty: number;
  note: string | null;
}

export interface MergePlan {
  updates: { id: string; requestedQty: number; note: string | null }[];
  inserts: IncomingItem[];
}

/** Agrupación: suma cantidades del mismo insumo en la requisición existente; los nuevos se insertan. */
export function planMerge(existing: ExistingItem[], incoming: IncomingItem[]): MergePlan {
  const bySupply = new Map(existing.map((e) => [e.supplyId, e]));
  const plan: MergePlan = { updates: [], inserts: [] };
  for (const it of normalizeIncomingItems(incoming)) {
    const e = bySupply.get(it.supplyId);
    if (e) plan.updates.push({ id: e.id, requestedQty: roundQty(e.requestedQty + it.quantity), note: joinNotes(e.note, it.note) });
    else plan.inserts.push(it);
  }
  return plan;
}

export interface ItemValidationSupply {
  id: string;
  name: string;
  active: boolean;
  maxPerOrder: number | null;
  inArea: boolean;
}

/** Valida cantidades contra el catálogo. Devuelve el primer error (español) o null. */
export function validateItemsAgainstCatalog(items: IncomingItem[], supplies: Map<string, ItemValidationSupply>): string | null {
  for (const it of items) {
    const s = supplies.get(it.supplyId);
    if (!s) return 'Uno de los insumos no existe';
    if (!s.active) return `El insumo «${s.name}» ya no está disponible`;
    if (!s.inArea) return `El insumo «${s.name}» no está asignado a esta área`;
    if (!(it.quantity > 0)) return `La cantidad de «${s.name}» debe ser mayor a cero`;
    if (s.maxPerOrder != null && it.quantity > s.maxPerOrder + 1e-9) {
      return `«${s.name}»: máximo ${formatQty(s.maxPerOrder)} por pedido`;
    }
  }
  return null;
}

// ------------------------------------------------------------------ revisión / surtido / recepción

export interface ReviewItemState {
  id: string;
  requestedQty: number;
}
export interface ReviewItemInput {
  id: string;
  approvedQty: number;
  note?: string;
}
export type ReviewAction = 'APPROVE_ALL' | 'APPROVE' | 'REJECT';

export type ReviewOutcome =
  | { ok: true; status: RequisitionStatus; items: { id: string; approvedQty: number; rejected: boolean; reviewNote: string | null }[] }
  | { ok: false; error: string };

/**
 * Calcula el estado de la revisión:
 *  - APPROVE_ALL: todo lo pedido → APROBADA
 *  - APPROVE: cantidades por renglón (los no enviados = lo pedido); si alguno se reduce o queda en 0 → APROBADA_PARCIAL;
 *    renglón en 0 ⇒ rejected. Si todos quedan en 0 → RECHAZADA.
 *  - REJECT: todo en 0 → RECHAZADA
 */
export function computeReviewOutcome(items: ReviewItemState[], action: ReviewAction, inputs?: ReviewItemInput[]): ReviewOutcome {
  if (action === 'APPROVE_ALL') {
    return { ok: true, status: 'APROBADA', items: items.map((i) => ({ id: i.id, approvedQty: i.requestedQty, rejected: false, reviewNote: null })) };
  }
  if (action === 'REJECT') {
    return { ok: true, status: 'RECHAZADA', items: items.map((i) => ({ id: i.id, approvedQty: 0, rejected: true, reviewNote: null })) };
  }
  const byId = new Map((inputs ?? []).map((x) => [x.id, x]));
  for (const id of byId.keys()) {
    if (!items.some((i) => i.id === id)) return { ok: false, error: 'Un renglón no pertenece a esta requisición' };
  }
  let reduced = false;
  const out = items.map((i) => {
    const inp = byId.get(i.id);
    const approvedQty = roundQty(inp ? inp.approvedQty : i.requestedQty);
    const rejected = approvedQty <= 0;
    if (rejected || approvedQty < i.requestedQty - 1e-9) reduced = true;
    return { id: i.id, approvedQty: rejected ? 0 : approvedQty, rejected, reviewNote: inp?.note?.trim() || null };
  });
  if (out.every((o) => o.rejected)) return { ok: true, status: 'RECHAZADA', items: out };
  return { ok: true, status: reduced ? 'APROBADA_PARCIAL' : 'APROBADA', items: out };
}

export interface QtyItemState {
  id: string;
  approvedQty: number | null;
  fulfilledQty: number | null;
  rejected: boolean;
}

export type QtyOutcome = { ok: true; items: { id: string; qty: number }[] } | { ok: false; error: string };

/** Surtido: por defecto fulfilledQty = approvedQty (renglones rechazados = 0). */
export function computeFulfill(items: QtyItemState[], inputs?: { id: string; fulfilledQty: number }[]): QtyOutcome {
  const byId = new Map((inputs ?? []).map((x) => [x.id, x.fulfilledQty]));
  for (const id of byId.keys()) if (!items.some((i) => i.id === id)) return { ok: false, error: 'Un renglón no pertenece a esta requisición' };
  return {
    ok: true,
    items: items.map((i) => ({ id: i.id, qty: roundQty(byId.get(i.id) ?? (i.rejected ? 0 : i.approvedQty ?? 0)) })),
  };
}

export interface ReceiveOutcomeOk {
  ok: true;
  items: { id: string; qty: number }[];
  hasDifferences: boolean;
  differences: { id: string; fulfilledQty: number; receivedQty: number }[];
}

/** Recepción: por defecto receivedQty = fulfilledQty; cualquier diferencia marca incidencia. */
export function computeReceive(
  items: QtyItemState[],
  inputs?: { id: string; receivedQty: number }[],
): ReceiveOutcomeOk | { ok: false; error: string } {
  const byId = new Map((inputs ?? []).map((x) => [x.id, x.receivedQty]));
  for (const id of byId.keys()) if (!items.some((i) => i.id === id)) return { ok: false, error: 'Un renglón no pertenece a esta requisición' };
  const differences: ReceiveOutcomeOk['differences'] = [];
  const out = items.map((i) => {
    const fulfilled = roundQty(i.fulfilledQty ?? 0);
    const received = roundQty(byId.get(i.id) ?? fulfilled);
    if (Math.abs(received - fulfilled) > 1e-9) differences.push({ id: i.id, fulfilledQty: fulfilled, receivedQty: received });
    return { id: i.id, qty: received };
  });
  return { ok: true, items: out, hasDifferences: differences.length > 0, differences };
}

// ------------------------------------------------------------------ lista de compras

export interface ShoppingRow {
  itemId: string;
  requisitionId: string;
  folio: string;
  areaId: string;
  areaName: string;
  supplyId: string;
  supplyName: string;
  unit: UnitCode;
  approvedQty: number;
  supplierId: string | null;
  supplierName: string | null;
  supplierPhone: string | null;
  supplierContact: string | null;
}

export interface ShoppingLine {
  supplyId: string;
  supplyName: string;
  unit: UnitCode;
  unitLabel: string;
  quantity: number;
  quantityText: string;
  itemIds: string[];
  sources: { requisitionId: string; folio: string; areaId: string; areaName: string; quantity: number }[];
}

export interface ShoppingGroup {
  supplierId: string | null;
  supplierName: string;
  phone: string | null;
  items: ShoppingLine[];
  whatsappText: string;
  waLink: string | null;
}

export const NO_SUPPLIER = 'Sin proveedor';

export function unitText(unit: UnitCode, qty: number): string {
  const l = UnitLabel[unit];
  if (!l) return unit;
  return Math.abs(qty - 1) < 1e-9 ? l.one : l.many;
}

/** Suma lo aprobado por insumo y agrupa por proveedor ("Sin proveedor" al final). */
export function aggregateShoppingList(rows: ShoppingRow[], businessName: string): ShoppingGroup[] {
  const groups = new Map<string, { g: Omit<ShoppingGroup, 'items' | 'whatsappText' | 'waLink'>; lines: Map<string, ShoppingLine>; contact: string | null }>();
  for (const r of rows) {
    if (!(r.approvedQty > 0)) continue;
    const gk = r.supplierId ?? '__none__';
    let g = groups.get(gk);
    if (!g) {
      g = {
        g: { supplierId: r.supplierId, supplierName: r.supplierId ? r.supplierName ?? NO_SUPPLIER : NO_SUPPLIER, phone: r.supplierId ? r.supplierPhone : null },
        lines: new Map(),
        contact: r.supplierContact,
      };
      groups.set(gk, g);
    }
    const lk = `${r.supplyId}|${r.unit}`;
    let line = g.lines.get(lk);
    if (!line) {
      line = { supplyId: r.supplyId, supplyName: r.supplyName, unit: r.unit, unitLabel: UnitLabel[r.unit]?.short ?? r.unit, quantity: 0, quantityText: '', itemIds: [], sources: [] };
      g.lines.set(lk, line);
    }
    line.quantity = roundQty(line.quantity + r.approvedQty);
    line.itemIds.push(r.itemId);
    const src = line.sources.find((s) => s.requisitionId === r.requisitionId);
    if (src) src.quantity = roundQty(src.quantity + r.approvedQty);
    else line.sources.push({ requisitionId: r.requisitionId, folio: r.folio, areaId: r.areaId, areaName: r.areaName, quantity: roundQty(r.approvedQty) });
  }
  const out: ShoppingGroup[] = [];
  for (const { g, lines, contact } of groups.values()) {
    const items = [...lines.values()]
      .map((l) => ({ ...l, quantityText: `${formatQty(l.quantity)} ${l.unitLabel}`, sources: l.sources.sort((a, b) => a.folio.localeCompare(b.folio)) }))
      .sort((a, b) => a.supplyName.localeCompare(b.supplyName, 'es'));
    const text = buildWhatsappText(g.supplierId ? contact || g.supplierName : null, businessName, items);
    out.push({ ...g, items, whatsappText: text, waLink: g.phone ? waLink(g.phone, text) : null });
  }
  return out.sort((a, b) => {
    if (!a.supplierId !== !b.supplierId) return a.supplierId ? -1 : 1;
    return a.supplierName.localeCompare(b.supplierName, 'es');
  });
}

export function buildWhatsappText(recipient: string | null, businessName: string, items: Pick<ShoppingLine, 'supplyName' | 'unit' | 'quantity'>[]): string {
  const greet = recipient ? `Hola ${recipient}, buen día.` : 'Lista de compras';
  const lines = items.map((i) => `• ${formatQty(i.quantity)} ${unitText(i.unit, i.quantity)} de ${i.supplyName}`);
  return [`${greet}`, `Pedido para *${businessName}*:`, ...lines, recipient ? '¡Gracias!' : ''].filter(Boolean).join('\n');
}

/** Link wa.me. Números de 10 dígitos se asumen de México (52). */
export function waLink(phone: string, text: string): string | null {
  let digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) digits = `52${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

// ------------------------------------------------------------------ horarios (zona horaria del negocio)

export interface LocalParts {
  date: string; // YYYY-MM-DD
  weekday: number; // 0 = domingo
  hhmm: string;
  minutes: number; // minutos desde medianoche
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localParts(d: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const hh = get('hour') === '24' ? '00' : get('hour');
  const mm = get('minute');
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: WEEKDAYS[get('weekday')] ?? 0,
    hhmm: `${hh}:${mm}`,
    minutes: Number(hh) * 60 + Number(mm),
  };
}

/** Instante UTC de la medianoche local (zona del negocio) de la fecha YYYY-MM-DD. */
export function localMidnightUtc(date: string, timeZone: string): Date {
  const guess = new Date(`${date}T00:00:00Z`);
  // diferencia entre la hora local que marca `guess` y la medianoche deseada; dos pasadas cubren cambios de horario
  let t = guess.getTime();
  for (let i = 0; i < 2; i++) {
    const p = localParts(new Date(t), timeZone);
    const localAsUtc = Date.parse(`${p.date}T${p.hhmm}:00Z`);
    t += guess.getTime() - localAsUtc;
  }
  return new Date(t);
}

export type OrderWindowMap = Record<string, { until: string }>;

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** ¿La requisición llega después del cierre de la ventana de pedido de hoy? (sin ventana hoy = no es tarde) */
export function isLateForWindow(window: OrderWindowMap | null | undefined, now: Date, timeZone: string): boolean {
  const p = localParts(now, timeZone);
  const w = window?.[String(p.weekday)];
  if (!w?.until) return false;
  return p.minutes > toMinutes(w.until);
}

/** Si faltan ≤ lead minutos para que cierre la ventana de hoy, devuelve la info del aviso. */
export function windowClosingInfo(
  window: OrderWindowMap | null | undefined, now: Date, timeZone: string, leadMinutes = 30,
): { until: string; minutesLeft: number; date: string } | null {
  const p = localParts(now, timeZone);
  const w = window?.[String(p.weekday)];
  if (!w?.until) return null;
  const left = toMinutes(w.until) - p.minutes;
  if (left > 0 && left <= leadMinutes) return { until: w.until, minutesLeft: left, date: p.date };
  return null;
}

// ------------------------------------------------------------------ CSV de insumos

export const CSV_COLUMNS = ['nombre', 'categoria', 'unidad', 'incremento', 'areas', 'proveedor', 'auto_aprobar', 'icono'] as const;

export function normalizeKey(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

const UNIT_ALIASES: Map<string, UnitCode> = (() => {
  const m = new Map<string, UnitCode>();
  for (const code of Object.keys(UnitLabel) as UnitCode[]) {
    const l = UnitLabel[code];
    for (const a of [code, l.one, l.many, l.short]) m.set(normalizeKey(a), code);
  }
  m.set('kilo', 'KG'); m.set('kgs', 'KG'); m.set('lt', 'L'); m.set('lts', 'L'); m.set('litro', 'L'); m.set('pza', 'PIEZA');
  m.set('pzas', 'PIEZA'); m.set('pz', 'PIEZA'); m.set('garrafon', 'GARRAFON'); m.set('paq', 'PAQUETE');
  return m;
})();

export function parseUnit(s: string): UnitCode | null {
  return UNIT_ALIASES.get(normalizeKey(s)) ?? null;
}

export function parseNumber(s: string | undefined): number | null {
  if (s == null || s.trim() === '') return null;
  const n = Number(s.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function parseBool(s: string | undefined): boolean {
  return ['si', 'sí', 's', 'true', '1', 'x', 'yes'].includes((s ?? '').trim().toLowerCase());
}

export interface ParsedSupplyRow {
  name: string;
  categoryName: string;
  unit: UnitCode;
  step: number;
  areaIds: string[];
  supplierName: string | null;
  autoApprove: boolean;
  icon: string | null;
}

const ICON_SET = new Set(SUPPLY_ICON_KEYS);

/** Valida una fila del CSV. `areasByName`: nombre normalizado → id de área. */
export function parseSupplyCsvRow(
  raw: Record<string, string | undefined>, areasByName: Map<string, string>,
): { ok: true; value: ParsedSupplyRow } | { ok: false; error: string } {
  const get = (k: string) => (raw[k] ?? '').trim();
  const name = get('nombre');
  if (!name) return { ok: false, error: 'Falta el nombre' };
  if (name.length > 80) return { ok: false, error: 'El nombre es demasiado largo (máx. 80)' };
  const categoryName = get('categoria');
  if (!categoryName) return { ok: false, error: 'Falta la categoría' };
  const unitRaw = get('unidad');
  const unit = parseUnit(unitRaw);
  if (!unit) return { ok: false, error: `Unidad inválida: «${unitRaw || '(vacía)'}»` };
  const stepRaw = get('incremento');
  const step = stepRaw ? parseNumber(stepRaw) : 1;
  if (step == null || step <= 0) return { ok: false, error: `Incremento inválido: «${stepRaw}»` };
  const areaIds: string[] = [];
  for (const a of get('areas').split('|').map((x) => x.trim()).filter(Boolean)) {
    const id = areasByName.get(normalizeKey(a));
    if (!id) return { ok: false, error: `Área desconocida: «${a}»` };
    if (!areaIds.includes(id)) areaIds.push(id);
  }
  const icon = get('icono') || null;
  if (icon && !ICON_SET.has(icon)) return { ok: false, error: `Ícono desconocido: «${icon}»` };
  return {
    ok: true,
    value: { name, categoryName, unit, step: roundQty(step), areaIds, supplierName: get('proveedor') || null, autoApprove: parseBool(get('auto_aprobar')), icon },
  };
}

export function csvTemplate(): string {
  return [
    CSV_COLUMNS.join(','),
    'Jitomate,Verdura,kg,1,Cocina,Verdulería Don José,no,tomato',
    'Limón,Fruta,kg,0.5,Cocina|Barra,Verdulería Don José,no,lemon',
    'Servilletas,Desechables,paquete,1,Barra,,si,',
  ].join('\r\n') + '\r\n';
}

// ------------------------------------------------------------------ utilidades

export function etagOf(payload: unknown): string {
  return `"${createHash('sha1').update(JSON.stringify(payload)).digest('base64url')}"`;
}

export function encodeCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}|${id}`;
}

export function decodeCursor(c: string | undefined | null): { createdAt: Date; id: string } | null {
  if (!c) return null;
  const i = c.indexOf('|');
  if (i < 0) return null;
  const d = new Date(c.slice(0, i));
  const id = c.slice(i + 1);
  if (Number.isNaN(d.getTime()) || !id) return null;
  return { createdAt: d, id };
}

/** Rellena días sin datos en la serie diaria (fechas YYYY-MM-DD inclusive). */
export function fillDailySeries(from: string, to: string, rows: { date: string; count: number }[]): { date: string; count: number }[] {
  const map = new Map(rows.map((r) => [r.date, r.count]));
  const out: { date: string; count: number }[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (let d = start; d <= end && out.length < 1000; d = new Date(d.getTime() + 86_400_000)) {
    const k = d.toISOString().slice(0, 10);
    out.push({ date: k, count: map.get(k) ?? 0 });
  }
  return out;
}
