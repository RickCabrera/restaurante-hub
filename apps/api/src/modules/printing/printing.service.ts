import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import type { Socket } from 'socket.io';
import { z } from 'zod';
import {
  AgentHello, AgentHelloAck, OrderType, PaymentMethodLabel, PrintAck, PrintClientRegister, PrintEvents,
  PrintJobKind, PrintJobMessage, PrinterConnectionLabel, PrinterDto, PrinterSchema, RT, printerRoom,
} from '@rh/shared';
import {
  KitchenTicketData, PrintDocument, ShoppingListTicketData, TicketBusinessInfo, TicketLine,
  buildCustomerTicket, buildKitchenTicket, buildShoppingListTicket, buildTestTicket,
} from '@rh/printing';
import { InjectDb, Db } from '../../db/db.module';
import { areas, orderItems, orders, printAgents, printJobs, printers, users } from '../../db/schema';
import type { Actor } from '../../common/actor';
import { RealtimeService, Rooms } from '../../realtime/realtime.service';
import { JobsService } from '../../jobs/jobs.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { SettingsService } from '../../settings/settings.service';
import { randomToken, sha256 } from '../../common/utils/crypto';
import { loadEnv } from '../../config/env';
import { OrderPrinter, PrintOrderOptions } from './order-printer.port';
import {
  MAX_PRINT_ATTEMPTS, PrinterRow, agentHandles, billPrinters, isAgentConnection, normalizePrinterConnection,
  paper, retryDelayMs, routeKitchenItems, toPrinterConfig,
} from './printing.logic';

type Printer = typeof printers.$inferSelect;
type PrintJob = typeof printJobs.$inferSelect;
type Agent = typeof printAgents.$inferSelect;

export interface PrintRefs { orderId?: string | null; ticketId?: string | null }

/** Renglón genérico para comandas (delivery o POS). */
export interface KitchenItem {
  productionAreaId: string | null;
  quantity: number;
  name: string;
  modifiers?: { name: string; quantity?: number }[];
  note?: string | null;
}

export interface KitchenPrintInput {
  businessId: string;
  folio: string;
  serviceLabel: string;
  createdAt: Date | string;
  customerName?: string | null;
  waiterName?: string | null;
  notes?: string | null;
  isReprint?: boolean;
  isAddition?: boolean;
  urgent?: boolean;
  items: KitchenItem[];
  refs: PrintRefs;
}

const AgentHelloSchema = z.object({
  version: z.string().max(40).default('?'),
  hostname: z.string().max(120).default(''),
  platform: z.string().max(40).default(''),
  kind: z.enum(['agent', 'desktop', 'android']).optional(),
  discovered: z.array(z.object({ name: z.string().max(200), type: z.string().max(20), path: z.string().max(300).optional() })).max(200).optional(),
});
const ClientRegisterSchema = z.object({ printerIds: z.array(z.string().min(1)).max(50), kind: z.enum(['browser', 'mobile']) });
const AckSchema = z.object({ jobId: z.string().min(1), status: z.enum(['PRINTED', 'FAILED']), error: z.string().max(500).optional() });
const DiscoveredSchema = z.union([
  z.array(AgentHelloSchema.shape.discovered.unwrap().element),
  z.object({ printers: AgentHelloSchema.shape.discovered.unwrap() }),
]);

const PENDING_MAX_AGE_MS = 24 * 3600_000;
const SENT_TIMEOUT_MS = 60_000;

export const CHANNEL_LABEL: Record<string, string> = {
  WHATSAPP: 'WhatsApp', WEB: 'Web', TELEFONO: 'Teléfono', MOSTRADOR: 'Mostrador', MESA: 'Mesa',
};
export const ORDER_TYPE_LABEL: Record<OrderType, string> = { DOMICILIO: 'Domicilio', PASAR_A_RECOGER: 'Pasar a recoger' };

/**
 * Impresión: agentes, impresoras, cola de trabajos y enrutamiento de comandas.
 * Implementa OrderPrinter (lo usa el módulo de delivery).
 */
@Injectable()
export class PrintingService implements OrderPrinter, OnModuleInit {
  private readonly log = new Logger('Printing');

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly rt: RealtimeService,
    private readonly jobs: JobsService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
  ) {}

  onModuleInit() {
    this.jobs.register<{ jobId: string }>('print.retry', (d) => this.retryFailed(d.jobId));

    this.rt.handle(PrintEvents.AGENT_HELLO, (s, a, p) => this.onAgentHello(s, a, p));
    this.rt.handle(PrintEvents.CLIENT_REGISTER, (s, a, p) => this.onClientRegister(s, a, p));
    this.rt.handle(PrintEvents.CLIENT_UNREGISTER, (s, a, p) => this.onClientUnregister(s, a, p));
    this.rt.handle(PrintEvents.PULL, (s, a) => this.onPull(s, a));
    this.rt.handle(PrintEvents.ACK, (s, a, p) => this.onAck(s, a, p));
    this.rt.handle(PrintEvents.DISCOVERED, (s, a, p) => this.onDiscovered(s, a, p));

    this.rt.onConnect(async (_s, actor) => {
      if (actor.kind !== 'agent') return;
      await this.setAgentOnline(actor.businessId, actor.agentId, true);
    });
    this.rt.onDisconnect(async (_s, actor) => {
      if (actor.kind !== 'agent') return;
      // ¿quedan otros sockets del mismo agente?
      const left = await this.rt.roomSize(Rooms.agent(actor.agentId));
      if (left === 0) await this.setAgentOnline(actor.businessId, actor.agentId, false);
    });
  }

  // =====================================================================
  // Agentes
  // =====================================================================

  private configFor(token: string) {
    const env = loadEnv();
    const apiUrl = env.API_URL.replace(/\/$/, '');
    return {
      apiUrl,
      token,
      /** Para pegar en el .env del print agent */
      configString: `RH_API_URL=${apiUrl}\nRH_AGENT_TOKEN=${token}`,
      /** Para pegar en el primer arranque de la app de escritorio / Android */
      pairingString: 'rh-agent:' + Buffer.from(JSON.stringify({ url: apiUrl, token })).toString('base64url'),
    };
  }

  agentDto(a: Agent, ps: Pick<Printer, 'id' | 'name' | 'connection' | 'active' | 'agentId'>[] = []) {
    return {
      id: a.id,
      name: a.name,
      kind: a.kind,
      online: a.online,
      lastSeenAt: a.lastSeenAt,
      version: a.version,
      hostname: a.hostname,
      platform: a.platform,
      discovered: a.discovered,
      revokedAt: a.revokedAt,
      createdAt: a.createdAt,
      printers: ps.filter((p) => p.agentId === a.id).map((p) => ({ id: p.id, name: p.name, connection: p.connection, active: p.active })),
    };
  }

  async listAgents(bid: string, includeRevoked = false) {
    const rows = await this.db.query.printAgents.findMany({
      where: includeRevoked ? eq(printAgents.businessId, bid) : and(eq(printAgents.businessId, bid), isNull(printAgents.revokedAt)),
      orderBy: asc(printAgents.createdAt),
    });
    const ps = await this.db.query.printers.findMany({
      where: eq(printers.businessId, bid),
      columns: { id: true, name: true, connection: true, active: true, agentId: true },
    });
    return rows.map((a) => this.agentDto(a, ps));
  }

  async createAgent(bid: string, dto: { name: string; kind: 'agent' | 'desktop' | 'android' }) {
    const token = randomToken(32);
    const [a] = await this.db
      .insert(printAgents)
      .values({ businessId: bid, name: dto.name.trim(), kind: dto.kind, tokenHash: sha256(token) })
      .returning();
    // Impresoras de agente sin asignar: si este es el único agente que las puede atender, se le asignan.
    const candidates = (await this.activeAgents(bid)).filter((x) => x.kind !== 'android');
    if (dto.kind !== 'android' && candidates.length === 1) {
      const orphan = await this.db.query.printers.findMany({ where: and(eq(printers.businessId, bid), isNull(printers.agentId)) });
      const ids = orphan.filter((p) => isAgentConnection(p.connection)).map((p) => p.id);
      if (ids.length) await this.db.update(printers).set({ agentId: a.id }).where(inArray(printers.id, ids));
    }
    const ps = await this.db.query.printers.findMany({ where: eq(printers.agentId, a.id) });
    this.rt.toManagers(bid, RT.AGENT_STATUS, { id: a.id, online: false, created: true });
    return { agent: this.agentDto(a, ps), ...this.configFor(token) };
  }

  async rotateAgentToken(bid: string, id: string) {
    const token = randomToken(32);
    const [a] = await this.db
      .update(printAgents)
      .set({ tokenHash: sha256(token), online: false })
      .where(and(eq(printAgents.id, id), eq(printAgents.businessId, bid), isNull(printAgents.revokedAt)))
      .returning();
    if (!a) throw new NotFoundException('Agente no encontrado');
    this.rt.server?.in(Rooms.agent(id)).disconnectSockets(true);
    const ps = await this.db.query.printers.findMany({ where: eq(printers.agentId, a.id) });
    return { agent: this.agentDto(a, ps), ...this.configFor(token) };
  }

  async revokeAgent(bid: string, id: string) {
    const [a] = await this.db
      .update(printAgents)
      .set({ revokedAt: new Date(), online: false })
      .where(and(eq(printAgents.id, id), eq(printAgents.businessId, bid), isNull(printAgents.revokedAt)))
      .returning();
    if (!a) throw new NotFoundException('Agente no encontrado');
    await this.db.update(printers).set({ agentId: null }).where(eq(printers.agentId, id));
    this.rt.server?.in(Rooms.agent(id)).disconnectSockets(true);
    this.rt.toManagers(bid, RT.AGENT_STATUS, { id, online: false, revoked: true });
    return { ok: true };
  }

  private activeAgents(bid: string) {
    return this.db.query.printAgents.findMany({ where: and(eq(printAgents.businessId, bid), isNull(printAgents.revokedAt)) });
  }

  private async setAgentOnline(bid: string, agentId: string, online: boolean) {
    const [a] = await this.db
      .update(printAgents)
      .set({ online, lastSeenAt: new Date() })
      .where(eq(printAgents.id, agentId))
      .returning();
    if (a) this.rt.toManagers(bid, RT.AGENT_STATUS, { id: a.id, name: a.name, online, lastSeenAt: a.lastSeenAt });
  }

  // =====================================================================
  // Impresoras
  // =====================================================================

  async printerDto(p: Printer & { area?: { name: string } | null; agent?: Agent | null }) {
    let clientsOnline = 0;
    if (p.connection === 'KDS') clientsOnline = p.areaId ? await this.rt.roomSize(Rooms.kds(p.areaId)) : 0;
    else clientsOnline = await this.rt.roomSize(printerRoom(p.id));
    return {
      ...p,
      connectionLabel: PrinterConnectionLabel[p.connection],
      areaName: p.area?.name ?? null,
      agentName: p.agent?.name ?? null,
      agentOnline: p.agent ? p.agent.online : null,
      /** sockets que pueden imprimir (o pantallas KDS conectadas) ahora mismo */
      clientsOnline,
      area: undefined,
      agent: undefined,
    };
  }

  async listPrinters(bid: string) {
    const rows = await this.db.query.printers.findMany({
      where: eq(printers.businessId, bid),
      with: { area: { columns: { name: true } }, agent: true },
      orderBy: asc(printers.createdAt),
    });
    return Promise.all(rows.map((p) => this.printerDto(p)));
  }

  async getPrinter(bid: string, id: string) {
    const p = await this.db.query.printers.findFirst({
      where: and(eq(printers.id, id), eq(printers.businessId, bid)),
      with: { area: { columns: { name: true } }, agent: true },
    });
    if (!p) throw new NotFoundException('Impresora no encontrada');
    return p;
  }

  private async validatePrinter(bid: string, input: PrinterDto): Promise<PrinterDto> {
    const n = normalizePrinterConnection(input);
    if (!n.ok) throw new BadRequestException(n.error);
    const v = n.value;
    if (v.areaId) {
      const a = await this.db.query.areas.findFirst({ where: and(eq(areas.id, v.areaId), eq(areas.businessId, bid)) });
      if (!a) throw new BadRequestException('Área inválida');
    }
    if (v.connection === 'KDS' && !v.areaId) throw new BadRequestException('Selecciona el área de la pantalla de cocina');
    const agents = await this.activeAgents(bid);
    if (v.agentId) {
      const ag = agents.find((x) => x.id === v.agentId);
      if (!ag) throw new BadRequestException('Agente de impresión inválido');
      if (!agentHandles(ag.kind, v.connection)) {
        throw new BadRequestException(`El agente "${ag.name}" no puede imprimir por ${PrinterConnectionLabel[v.connection]}`);
      }
    } else if (isAgentConnection(v.connection)) {
      const cands = agents.filter((x) => agentHandles(x.kind, v.connection));
      if (cands.length === 1) v.agentId = cands[0].id;
      else if (cands.length > 1) throw new BadRequestException('Selecciona qué agente de impresión atiende esta impresora');
      else v.agentId = null; // se asignará al registrar el primer agente
    }
    return v;
  }

  async createPrinter(bid: string, dto: PrinterDto) {
    const v = await this.validatePrinter(bid, dto);
    const [p] = await this.db.insert(printers).values({ ...v, businessId: bid }).returning();
    await this.afterPrinterChange([p.agentId]);
    return this.printerDto(await this.getPrinter(bid, p.id));
  }

  async updatePrinter(bid: string, id: string, patch: Partial<PrinterDto>) {
    const cur = await this.getPrinter(bid, id);
    const { area: _a, agent: _g, ...curRow } = cur;
    const merged = PrinterSchema.safeParse({ ...curRow, ...patch });
    if (!merged.success) throw new BadRequestException(merged.error.issues[0]?.message ?? 'Datos inválidos');
    const v = await this.validatePrinter(bid, merged.data);
    await this.db.update(printers).set({ ...v, lastError: null }).where(eq(printers.id, id));
    await this.afterPrinterChange([cur.agentId, v.agentId ?? null]);
    return this.printerDto(await this.getPrinter(bid, id));
  }

  async deletePrinter(bid: string, id: string) {
    const cur = await this.getPrinter(bid, id);
    this.rt.server?.in(printerRoom(id)).socketsLeave(printerRoom(id));
    await this.db.delete(printers).where(eq(printers.id, id));
    await this.afterPrinterChange([cur.agentId]);
    return { ok: true };
  }

  private async afterPrinterChange(agentIds: (string | null | undefined)[]) {
    for (const aid of new Set(agentIds.filter((x): x is string => !!x))) await this.syncAgent(aid);
  }

  private async agentPrinters(agentId: string, kind?: string): Promise<Printer[]> {
    const ps = await this.db.query.printers.findMany({
      where: and(eq(printers.agentId, agentId), eq(printers.active, true)),
      orderBy: asc(printers.createdAt),
    });
    const k = kind ?? (await this.db.query.printAgents.findFirst({ where: eq(printAgents.id, agentId), columns: { kind: true } }))?.kind ?? 'agent';
    return ps.filter((p) => agentHandles(k, p.connection));
  }

  /** Re-sincroniza las salas `printer:{id}` de los sockets del agente, avisa el cambio y despacha pendientes. */
  async syncAgent(agentId: string) {
    const ps = await this.agentPrinters(agentId);
    const want = new Set(ps.map((p) => printerRoom(p.id)));
    if (this.rt.server) {
      const sockets = await this.rt.server.in(Rooms.agent(agentId)).fetchSockets();
      for (const s of sockets) {
        for (const r of s.rooms) if (r.startsWith('printer:') && !want.has(r)) s.leave(r);
        s.join([...want]);
      }
    }
    this.rt.emit(Rooms.agent(agentId), PrintEvents.PRINTERS_CHANGED, { printers: ps.map((p) => toPrinterConfig(p as PrinterRow)) });
    await this.dispatchPendingFor(ps.map((p) => p.id));
  }

  // =====================================================================
  // Trabajos
  // =====================================================================

  jobDto(j: PrintJob & { printer?: { name: string } | null }) {
    return {
      id: j.id,
      printerId: j.printerId,
      printerName: j.printer?.name ?? null,
      agentId: j.agentId,
      kind: j.kind,
      title: (j.document as PrintDocument | null)?.title ?? '',
      status: j.status,
      attempts: j.attempts,
      error: j.error,
      orderId: j.orderId,
      ticketId: j.ticketId,
      createdAt: j.createdAt,
      sentAt: j.sentAt,
      printedAt: j.printedAt,
    };
  }

  /**
   * Encola un trabajo para una impresora y lo despacha si hay un cliente conectado.
   * Las pantallas KDS e impresoras inactivas no generan trabajos (devuelve null).
   */
  async enqueue(
    businessId: string,
    printerOrId: string | Printer,
    kind: PrintJobKind,
    document: PrintDocument,
    refs: PrintRefs = {},
  ): Promise<PrintJob | null> {
    const p = typeof printerOrId === 'string'
      ? await this.db.query.printers.findFirst({ where: and(eq(printers.id, printerOrId), eq(printers.businessId, businessId)) })
      : printerOrId;
    if (!p) throw new NotFoundException('Impresora no encontrada');
    if (p.connection === 'KDS' || !p.active) return null;
    const [job] = await this.db
      .insert(printJobs)
      .values({
        businessId,
        printerId: p.id,
        kind,
        document,
        orderId: refs.orderId ?? null,
        ticketId: refs.ticketId ?? null,
        status: 'PENDING',
      })
      .returning();
    const sent = await this.dispatch(job, p);
    return sent ?? job;
  }

  private jobMessage(job: PrintJob, p: Printer): PrintJobMessage {
    return {
      jobId: job.id,
      kind: job.kind,
      printer: toPrinterConfig(p as PrinterRow),
      document: job.document,
      createdAt: job.createdAt.toISOString(),
    };
  }

  /**
   * Envía el trabajo a UN socket de la sala `printer:{id}`.
   * Reclama el trabajo de forma atómica (PENDING → SENT) para evitar envíos duplicados.
   * Sin socket conectado queda PENDING (el cliente lo pide al conectarse).
   */
  async dispatch(job: PrintJob, printer?: Printer, from: 'PENDING' | 'SENT' = 'PENDING'): Promise<PrintJob | null> {
    if (!this.rt.server) return null;
    const p = printer ?? (await this.db.query.printers.findFirst({ where: eq(printers.id, job.printerId) }));
    if (!p || p.connection === 'KDS') return null;
    const sockets = await this.rt.server.in(printerRoom(p.id)).fetchSockets();
    if (!sockets.length) return null;
    const target = sockets[Math.floor(Math.random() * sockets.length)];
    const actor = target.data?.actor as Actor | undefined;
    const conds = [eq(printJobs.id, job.id), eq(printJobs.status, from)];
    if (from === 'SENT') conds.push(lt(printJobs.sentAt, new Date(Date.now() - SENT_TIMEOUT_MS)));
    const [claimed] = await this.db
      .update(printJobs)
      .set({
        status: 'SENT',
        sentAt: new Date(),
        attempts: sql`${printJobs.attempts} + 1`,
        agentId: actor?.kind === 'agent' ? actor.agentId : null,
      })
      .where(and(...conds))
      .returning();
    if (!claimed) return null;
    target.emit(PrintEvents.JOB, this.jobMessage(claimed, p));
    this.emitJob(claimed, p.name);
    return claimed;
  }

  private emitJob(job: PrintJob, printerName?: string) {
    this.rt.toManagers(job.businessId, RT.PRINT_JOB_UPDATED, this.jobDto({ ...job, printer: printerName ? { name: printerName } : null }));
  }

  /** Despacha los pendientes recientes (más antiguos primero) de esas impresoras. */
  async dispatchPendingFor(printerIds: string[]) {
    if (!printerIds.length) return;
    const pend = await this.db.query.printJobs.findMany({
      where: and(
        inArray(printJobs.printerId, printerIds),
        eq(printJobs.status, 'PENDING'),
        gte(printJobs.createdAt, new Date(Date.now() - PENDING_MAX_AGE_MS)),
      ),
      orderBy: asc(printJobs.createdAt),
      limit: 200,
    });
    const ps = await this.db.query.printers.findMany({ where: inArray(printers.id, printerIds) });
    for (const j of pend) {
      const p = ps.find((x) => x.id === j.printerId);
      if (p) await this.dispatch(j, p);
    }
  }

  async listJobs(bid: string, q: { status?: string; printerId?: string; limit?: number }) {
    const conds = [eq(printJobs.businessId, bid)];
    if (q.status) conds.push(eq(printJobs.status, q.status as PrintJob['status']));
    if (q.printerId) conds.push(eq(printJobs.printerId, q.printerId));
    const rows = await this.db.query.printJobs.findMany({
      where: and(...conds),
      with: { printer: { columns: { name: true } } },
      orderBy: desc(printJobs.createdAt),
      limit: Math.min(Math.max(q.limit ?? 50, 1), 200),
    });
    return rows.map((r) => this.jobDto(r));
  }

  async getJob(bid: string, id: string, withDocument = false) {
    const j = await this.db.query.printJobs.findFirst({
      where: and(eq(printJobs.id, id), eq(printJobs.businessId, bid)),
      with: { printer: { columns: { name: true } } },
    });
    if (!j) throw new NotFoundException('Trabajo de impresión no encontrado');
    return withDocument ? { ...this.jobDto(j), document: j.document } : this.jobDto(j);
  }

  /** Reimprimir / reintentar manualmente (cualquier estado excepto PENDING en curso). */
  async retryJob(bid: string, id: string) {
    const [j] = await this.db
      .update(printJobs)
      .set({ status: 'PENDING', error: null, attempts: 0, sentAt: null, printedAt: null })
      .where(and(eq(printJobs.id, id), eq(printJobs.businessId, bid)))
      .returning();
    if (!j) throw new NotFoundException('Trabajo de impresión no encontrado');
    const sent = await this.dispatch(j);
    const out = sent ?? j;
    if (!sent) this.emitJob(out);
    return this.getJob(bid, out.id);
  }

  async cancelJob(bid: string, id: string) {
    const [j] = await this.db
      .update(printJobs)
      .set({ status: 'CANCELLED' })
      .where(and(eq(printJobs.id, id), eq(printJobs.businessId, bid), ne(printJobs.status, 'PRINTED')))
      .returning();
    if (!j) throw new ConflictException('El trabajo no existe o ya se imprimió');
    this.emitJob(j);
    return this.getJob(bid, id);
  }

  async testPrinter(bid: string, id: string) {
    const p = await this.getPrinter(bid, id);
    if (p.connection === 'KDS') throw new BadRequestException('Las pantallas de cocina no imprimen');
    if (!p.active) throw new BadRequestException('La impresora está desactivada');
    const doc = buildTestTicket({
      printerName: p.name,
      connectionLabel: PrinterConnectionLabel[p.connection],
      paperWidth: paper(p),
      createdAt: new Date().toISOString(),
    });
    const job = await this.enqueue(bid, p, 'TEST', doc);
    return job ? this.getJob(bid, job.id) : null;
  }

  async printGeneric(bid: string, printerId: string, kind: PrintJobKind, document: PrintDocument) {
    const job = await this.enqueue(bid, printerId, kind, document);
    if (!job) throw new BadRequestException('Esa impresora no imprime (pantalla de cocina o desactivada)');
    return this.getJob(bid, job.id);
  }

  async printShoppingList(bid: string, printerId: string, data: ShoppingListTicketData) {
    const p = await this.getPrinter(bid, printerId);
    return this.printGeneric(bid, p.id, 'SHOPPING_LIST', buildShoppingListTicket(data, paper(p)));
  }

  // =====================================================================
  // Sockets
  // =====================================================================

  private async onAgentHello(socket: Socket, actor: Actor | null, payload: unknown): Promise<AgentHelloAck> {
    if (actor?.kind !== 'agent') throw new Error('Solo agentes de impresión');
    const h = AgentHelloSchema.parse(payload ?? {}) as AgentHello;
    const [a] = await this.db
      .update(printAgents)
      .set({
        online: true,
        lastSeenAt: new Date(),
        version: h.version,
        hostname: h.hostname,
        platform: h.platform,
        ...(h.discovered ? { discovered: h.discovered } : {}),
      })
      .where(eq(printAgents.id, actor.agentId))
      .returning();
    if (!a) throw new Error('Agente no encontrado');
    const ps = await this.agentPrinters(a.id, a.kind);
    await socket.join(ps.map((p) => printerRoom(p.id)));
    this.rt.toManagers(a.businessId, RT.AGENT_STATUS, this.agentDto(a, ps));
    // Despacha pendientes después de responder el ack (el cliente ya conoce sus impresoras).
    setImmediate(() => void this.dispatchPendingFor(ps.map((p) => p.id)).catch((e) => this.log.warn(e.message)));
    return { agentId: a.id, businessId: a.businessId, printers: ps.map((p) => toPrinterConfig(p as PrinterRow)) };
  }

  private async onClientRegister(socket: Socket, actor: Actor | null, payload: unknown) {
    if (!actor || actor.kind === 'agent') throw new Error('No autorizado');
    const dto = ClientRegisterSchema.parse(payload ?? {}) as PrintClientRegister;
    const wanted = dto.kind === 'browser' ? 'BROWSER' : 'BLUETOOTH';
    const ps = dto.printerIds.length
      ? await this.db.query.printers.findMany({
        where: and(inArray(printers.id, dto.printerIds), eq(printers.businessId, actor.businessId), eq(printers.active, true)),
      })
      : [];
    const ok = ps.filter((p) => p.connection === wanted);
    const prev = new Set<string>(socket.data.printerIds ?? []);
    ok.forEach((p) => prev.add(p.id));
    socket.data.printerIds = [...prev];
    await socket.join(ok.map((p) => printerRoom(p.id)));
    setImmediate(() => void this.dispatchPendingFor(ok.map((p) => p.id)).catch((e) => this.log.warn(e.message)));
    return {
      printers: ok.map((p) => toPrinterConfig(p as PrinterRow)),
      rejected: dto.printerIds.filter((id) => !ok.some((p) => p.id === id)),
    };
  }

  private async onClientUnregister(socket: Socket, _actor: Actor | null, payload: unknown) {
    const ids = (payload as { printerIds?: string[] } | null)?.printerIds;
    const rooms = [...socket.rooms].filter((r) => r.startsWith('printer:'));
    const leave = ids?.length ? rooms.filter((r) => ids.includes(r.slice('printer:'.length))) : rooms;
    for (const r of leave) await socket.leave(r);
    socket.data.printerIds = ((socket.data.printerIds ?? []) as string[]).filter((id) => !leave.includes(printerRoom(id)));
    return { ok: true };
  }

  /** Trabajos pendientes de las impresoras que atiende este socket (se marcan SENT). */
  private async onPull(socket: Socket, actor: Actor | null) {
    if (!actor) throw new Error('No autorizado');
    const ids = [...socket.rooms].filter((r) => r.startsWith('printer:')).map((r) => r.slice('printer:'.length));
    if (!ids.length) return { jobs: [] };
    const ps = await this.db.query.printers.findMany({ where: and(inArray(printers.id, ids), eq(printers.businessId, actor.businessId)) });
    const pend = await this.db.query.printJobs.findMany({
      where: and(
        inArray(printJobs.printerId, ps.map((p) => p.id)),
        eq(printJobs.status, 'PENDING'),
        gte(printJobs.createdAt, new Date(Date.now() - PENDING_MAX_AGE_MS)),
      ),
      orderBy: asc(printJobs.createdAt),
      limit: 100,
    });
    const out: PrintJobMessage[] = [];
    for (const j of pend) {
      const [c] = await this.db
        .update(printJobs)
        .set({ status: 'SENT', sentAt: new Date(), attempts: sql`${printJobs.attempts} + 1`, agentId: actor.kind === 'agent' ? actor.agentId : null })
        .where(and(eq(printJobs.id, j.id), eq(printJobs.status, 'PENDING')))
        .returning();
      const p = ps.find((x) => x.id === j.printerId);
      if (c && p) {
        out.push(this.jobMessage(c, p));
        this.emitJob(c, p.name);
      }
    }
    return { jobs: out };
  }

  private async onAck(_socket: Socket, actor: Actor | null, payload: unknown) {
    if (!actor) throw new Error('No autorizado');
    const a = AckSchema.parse(payload ?? {}) as PrintAck;
    return this.ack(actor.businessId, a);
  }

  /** Resultado de impresión reportado por el cliente. */
  async ack(businessId: string, a: PrintAck) {
    const job = await this.db.query.printJobs.findFirst({
      where: and(eq(printJobs.id, a.jobId), eq(printJobs.businessId, businessId)),
      with: { printer: true },
    });
    if (!job) throw new Error('Trabajo no encontrado');
    if (job.status === 'PRINTED' || job.status === 'CANCELLED') return { status: job.status };
    if (a.status === 'PRINTED') {
      const [j] = await this.db
        .update(printJobs)
        .set({ status: 'PRINTED', printedAt: new Date(), error: null })
        .where(eq(printJobs.id, job.id))
        .returning();
      if (job.printer.lastError) await this.db.update(printers).set({ lastError: null }).where(eq(printers.id, job.printerId));
      this.emitJob(j, job.printer.name);
      return { status: j.status };
    }
    const error = (a.error || 'Error desconocido').slice(0, 500);
    const [j] = await this.db
      .update(printJobs)
      .set({ status: 'FAILED', error })
      .where(eq(printJobs.id, job.id))
      .returning();
    await this.db.update(printers).set({ lastError: error }).where(eq(printers.id, job.printerId));
    this.emitJob(j, job.printer.name);
    await this.handleFailure(j, job.printer.name);
    return { status: j.status };
  }

  private async handleFailure(j: PrintJob, printerName: string) {
    if (j.attempts < MAX_PRINT_ATTEMPTS) {
      await this.jobs.add('print.retry', { jobId: j.id }, {
        delayMs: retryDelayMs(j.attempts), attempts: 1, jobId: `print-retry-${j.id}-${j.attempts}`,
      });
      return;
    }
    await this.notifications.notifyManagers(j.businessId, {
      type: 'PRINT_ERROR',
      title: 'Error de impresión',
      body: `No se pudo imprimir en ${printerName}: ${j.error ?? 'sin respuesta'}`,
      link: '/admin/impresoras',
      data: { jobId: j.id, printerId: j.printerId, orderId: j.orderId, ticketId: j.ticketId },
      urgent: j.kind === 'KITCHEN',
    }).catch((e) => this.log.warn(`notify: ${(e as Error).message}`));
  }

  private async retryFailed(jobId: string) {
    const [j] = await this.db
      .update(printJobs)
      .set({ status: 'PENDING' })
      .where(and(eq(printJobs.id, jobId), eq(printJobs.status, 'FAILED')))
      .returning();
    if (j) await this.dispatch(j);
  }

  private async onDiscovered(_socket: Socket, actor: Actor | null, payload: unknown) {
    if (actor?.kind !== 'agent') return { ok: false };
    const d = DiscoveredSchema.parse(payload ?? []);
    const list = Array.isArray(d) ? d : d.printers;
    await this.db.update(printAgents).set({ discovered: list, lastSeenAt: new Date() }).where(eq(printAgents.id, actor.agentId));
    this.rt.toManagers(actor.businessId, RT.AGENT_STATUS, { id: actor.agentId, discovered: list });
    return { ok: true };
  }

  /** Cada minuto: reenvía SENT sin confirmación (> 60 s) y PENDING cuya impresora ya tiene cliente. */
  @Cron('*/1 * * * *')
  async sweep() {
    if (!this.rt.server) return;
    try {
      const lost = await this.db.query.printJobs.findMany({
        where: and(eq(printJobs.status, 'SENT'), lt(printJobs.sentAt, new Date(Date.now() - SENT_TIMEOUT_MS))),
        with: { printer: true },
        limit: 200,
      });
      for (const j of lost) {
        if (j.attempts >= MAX_PRINT_ATTEMPTS) {
          const [f] = await this.db
            .update(printJobs)
            .set({ status: 'FAILED', error: 'Sin confirmación del cliente de impresión' })
            .where(and(eq(printJobs.id, j.id), eq(printJobs.status, 'SENT')))
            .returning();
          if (f) {
            this.emitJob(f, j.printer.name);
            await this.handleFailure(f, j.printer.name);
          }
          continue;
        }
        const sent = await this.dispatch(j, j.printer, 'SENT');
        if (!sent) {
          // sin cliente: regresa a PENDING para enviarse al reconectar
          await this.db
            .update(printJobs)
            .set({ status: 'PENDING' })
            .where(and(eq(printJobs.id, j.id), eq(printJobs.status, 'SENT'), lt(printJobs.sentAt, new Date(Date.now() - SENT_TIMEOUT_MS))));
        }
      }
      const pend = await this.db
        .selectDistinct({ printerId: printJobs.printerId })
        .from(printJobs)
        .where(and(eq(printJobs.status, 'PENDING'), gte(printJobs.createdAt, new Date(Date.now() - PENDING_MAX_AGE_MS))));
      const withClient: string[] = [];
      for (const r of pend) if ((await this.rt.roomSize(printerRoom(r.printerId))) > 0) withClient.push(r.printerId);
      await this.dispatchPendingFor(withClient);
    } catch (e) {
      this.log.warn(`sweep: ${(e as Error).message}`);
    }
  }

  // =====================================================================
  // Comandas y tickets
  // =====================================================================

  async businessInfo(bid: string): Promise<TicketBusinessInfo> {
    const b = await this.settings.getBusiness(bid);
    const s = await this.settings.getSettings(bid);
    return { name: b.name, address: b.address, phone: b.phone, footer: s.ticketFooter ?? null, logoUrl: b.logoUrl };
  }

  activePrinters(bid: string) {
    return this.db.query.printers.findMany({
      where: and(eq(printers.businessId, bid), eq(printers.active, true)),
      orderBy: asc(printers.createdAt),
    });
  }

  /**
   * Comandas por área de producción (delivery y POS). Devuelve los trabajos creados
   * y las áreas con renglones (para avisar a las pantallas KDS).
   */
  async printKitchen(input: KitchenPrintInput) {
    const ps = await this.activePrinters(input.businessId);
    const routed = routeKitchenItems(input.items, ps as PrinterRow[]);
    const areaIds = [...new Set(input.items.map((i) => i.productionAreaId).filter((x): x is string => !!x))];
    const areaRows = areaIds.length ? await this.db.query.areas.findMany({ where: inArray(areas.id, areaIds), columns: { id: true, name: true } }) : [];
    const created: PrintJob[] = [];
    for (const g of routed) {
      const areaName = g.areaId ? areaRows.find((a) => a.id === g.areaId)?.name ?? 'Cocina' : 'Comanda';
      const data: KitchenTicketData = {
        folio: input.folio,
        areaName,
        createdAt: new Date(input.createdAt).toISOString(),
        serviceLabel: input.serviceLabel,
        customerName: input.customerName ?? null,
        waiterName: input.waiterName ?? null,
        notes: input.notes ?? null,
        isReprint: input.isReprint,
        isAddition: input.isAddition,
        urgent: input.urgent,
        lines: g.items.map((i) => ({
          quantity: i.quantity,
          name: i.name,
          modifiers: (i.modifiers ?? []).map((m) => ({ name: m.name, quantity: m.quantity })),
          note: i.note ?? null,
        })),
      };
      const job = await this.enqueue(input.businessId, ps.find((p) => p.id === g.printer.id)!, 'KITCHEN', buildKitchenTicket(data, paper(g.printer)), input.refs);
      if (job) created.push(job);
    }
    return { jobs: created, areaIds };
  }

  /** Envía un documento a las impresoras de caja/cliente (printsCustomerTicket o la primera activa). */
  async printToBillPrinters(
    bid: string,
    kind: PrintJobKind,
    build: (p: Printer) => PrintDocument,
    refs: PrintRefs = {},
    opts: { strict?: boolean } = {},
  ) {
    const ps = await this.activePrinters(bid);
    const targets = billPrinters(ps as PrinterRow[], opts.strict);
    const out: PrintJob[] = [];
    for (const t of targets) {
      const p = ps.find((x) => x.id === t.id)!;
      const job = await this.enqueue(bid, p, kind, build(p), refs);
      if (job) out.push(job);
    }
    return out;
  }

  /** OrderPrinter: comandas por área + ticket de cliente/repartidor de un pedido de delivery. */
  async printOrder(orderId: string, opts: PrintOrderOptions = {}): Promise<void> {
    const { kitchen = true, customer = true, reprint = false } = opts;
    const o = await this.db.query.orders.findFirst({ where: eq(orders.id, orderId) });
    if (!o) throw new NotFoundException('Pedido no encontrado');
    const items = await this.db.query.orderItems.findMany({ where: eq(orderItems.orderId, orderId) });
    const refs = { orderId };
    const serviceLabel = o.type === 'DOMICILIO' ? 'DOMICILIO' : 'PASAR A RECOGER';

    if (kitchen && items.length) {
      const { areaIds } = await this.printKitchen({
        businessId: o.businessId,
        folio: o.folio,
        serviceLabel,
        createdAt: o.createdAt,
        customerName: o.customerName,
        notes: o.notes,
        isReprint: reprint,
        items: items.map((i) => ({
          productionAreaId: i.productionAreaId,
          quantity: i.quantity,
          name: i.productName,
          modifiers: i.modifiers.map((m) => ({ name: m.name, quantity: m.quantity })),
          note: i.note,
        })),
        refs,
      });
      if (!reprint) {
        for (const a of areaIds) this.rt.emit(Rooms.kds(a), RT.KDS_UPDATED, { areaId: a, source: 'ORDER', id: o.id });
      }
    }

    if (customer) {
      const business = await this.businessInfo(o.businessId);
      const driver = o.driverId
        ? await this.db.query.users.findFirst({ where: eq(users.id, o.driverId), columns: { name: true } })
        : null;
      const lines: TicketLine[] = items.map((i) => ({
        quantity: i.quantity,
        name: i.productName,
        modifiers: i.modifiers.map((m) => ({ name: m.name, quantity: m.quantity, priceCents: m.priceCents })),
        note: i.note,
        totalCents: i.totalCents,
      }));
      const cashGiven = o.paymentMethod === 'EFECTIVO' ? o.cashGivenCents : null;
      await this.printToBillPrinters(
        o.businessId,
        'CUSTOMER',
        (p) => buildCustomerTicket({
          business,
          folio: reprint ? `${o.folio} (copia)` : o.folio,
          createdAt: o.createdAt.toISOString(),
          channelLabel: CHANNEL_LABEL[o.channel] ?? o.channel,
          typeLabel: ORDER_TYPE_LABEL[o.type],
          customerName: o.customerName,
          customerPhone: o.customerPhone,
          address: o.type === 'DOMICILIO' ? o.addressText : null,
          references: o.type === 'DOMICILIO' ? o.addressRefs : null,
          mapsUrl: o.type === 'DOMICILIO' && o.lat != null && o.lng != null ? `https://maps.google.com/?q=${o.lat},${o.lng}` : null,
          lines,
          subtotalCents: o.subtotalCents,
          discountCents: o.discountCents,
          deliveryFeeCents: o.deliveryFeeCents,
          totalCents: o.totalCents,
          paymentLabel: PaymentMethodLabel[o.paymentMethod] ?? o.paymentMethod,
          cashGivenCents: cashGiven,
          changeCents: cashGiven != null ? Math.max(0, cashGiven - o.totalCents) : null,
          notes: o.notes,
          estimatedMinutes: o.estimatedMinutes,
          driverName: driver?.name ?? null,
        }, paper(p)),
        refs,
        { strict: true },
      );
    }
  }
}
