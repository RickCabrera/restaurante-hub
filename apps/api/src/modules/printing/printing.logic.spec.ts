import type { PrinterDto } from '@rh/shared';
import {
  PrinterRow, agentHandles, billPrinters, listConnections, normalizePrinterConnection, retryDelayMs, routeKitchenItems,
} from './printing.logic';

const P = (o: Partial<PrinterRow> & { id: string }): PrinterRow => ({
  name: o.id, areaId: null, agentId: null, connection: 'NETWORK', dialect: 'ESC_POS', host: '10.0.0.1', port: 9100,
  devicePath: null, windowsName: null, baudRate: null, bluetoothAddress: null, paperWidth: 80, copies: 1,
  cutPaper: true, openDrawer: false, printsCustomerTicket: false, active: true, ...o,
});
const base = (o: Partial<PrinterDto>): PrinterDto => ({
  name: 'X', connection: 'NETWORK', dialect: 'ESC_POS', paperWidth: 80, copies: 1, cutPaper: true, openDrawer: false,
  printsCustomerTicket: false, active: true, ...o,
});

describe('routeKitchenItems', () => {
  const printers = [
    P({ id: 'cocina1', areaId: 'COC' }),
    P({ id: 'cocina2', areaId: 'COC', connection: 'BROWSER' }),
    P({ id: 'barraKds', areaId: 'BAR', connection: 'KDS' }),
    P({ id: 'caja', areaId: null, printsCustomerTicket: true }),
    P({ id: 'off', areaId: 'COC', active: false }),
  ];

  it('agrupa por área y envía a todas las impresoras activas del área', () => {
    const r = routeKitchenItems([
      { productionAreaId: 'COC', n: 1 }, { productionAreaId: 'COC', n: 2 }, { productionAreaId: 'BAR', n: 3 },
    ], printers);
    expect(r.map((g) => g.printer.id).sort()).toEqual(['cocina1', 'cocina2']);
    expect(r[0].items.map((i) => i.n)).toEqual([1, 2]);
  });

  it('omite pantallas KDS (el área solo con KDS no genera trabajos)', () => {
    const r = routeKitchenItems([{ productionAreaId: 'BAR' }], printers);
    expect(r).toHaveLength(0);
  });

  it('productos sin área van a impresoras de ticket de cliente', () => {
    const r = routeKitchenItems([{ productionAreaId: null }], printers);
    expect(r.map((g) => g.printer.id)).toEqual(['caja']);
    expect(r[0].areaId).toBeNull();
  });

  it('sin impresoras de cliente usa la primera activa; área sin impresoras cae al respaldo', () => {
    const ps = [P({ id: 'a', areaId: 'COC' }), P({ id: 'b', areaId: 'X' })];
    const r = routeKitchenItems([{ productionAreaId: null }, { productionAreaId: 'GHOST' }], ps);
    expect(r).toHaveLength(1);
    expect(r[0].printer.id).toBe('a');
    expect(r[0].items).toHaveLength(2);
  });
});

describe('billPrinters', () => {
  it('prefiere printsCustomerTicket, excluye KDS e inactivas', () => {
    const ps = [P({ id: 'k', connection: 'KDS', printsCustomerTicket: true }), P({ id: 'a' }), P({ id: 'c', printsCustomerTicket: true })];
    expect(billPrinters(ps).map((p) => p.id)).toEqual(['c']);
    expect(billPrinters([P({ id: 'a' }), P({ id: 'b' })]).map((p) => p.id)).toEqual(['a']);
    expect(billPrinters([P({ id: 'a' })], true)).toEqual([]);
  });
});

describe('normalizePrinterConnection', () => {
  it('NETWORK requiere host y usa puerto 9100 por defecto', () => {
    expect(normalizePrinterConnection(base({ connection: 'NETWORK' })).ok).toBe(false);
    const r = normalizePrinterConnection(base({ connection: 'NETWORK', host: ' 192.168.1.50 ', devicePath: '/x' }));
    expect(r.ok && r.value).toMatchObject({ host: '192.168.1.50', port: 9100, devicePath: null });
  });
  it('USB_DEVICE / WINDOWS_PRINTER / SERIAL requieren su campo', () => {
    expect(normalizePrinterConnection(base({ connection: 'USB_DEVICE' })).ok).toBe(false);
    expect(normalizePrinterConnection(base({ connection: 'WINDOWS_PRINTER' })).ok).toBe(false);
    expect(normalizePrinterConnection(base({ connection: 'SERIAL' })).ok).toBe(false);
    const s = normalizePrinterConnection(base({ connection: 'SERIAL', devicePath: 'COM3' }));
    expect(s.ok && s.value).toMatchObject({ devicePath: 'COM3', baudRate: 9600, host: null });
    const w = normalizePrinterConnection(base({ connection: 'WINDOWS_PRINTER', windowsName: 'EPSON TM-T20' }));
    expect(w.ok && w.value.windowsName).toBe('EPSON TM-T20');
  });
  it('BLUETOOTH dirección opcional; BROWSER/KDS sin campos ni agente', () => {
    expect(normalizePrinterConnection(base({ connection: 'BLUETOOTH' })).ok).toBe(true);
    const b = normalizePrinterConnection(base({ connection: 'BROWSER', host: 'x', agentId: 'a1' }));
    expect(b.ok && b.value).toMatchObject({ host: null, agentId: null });
    const k = normalizePrinterConnection(base({ connection: 'KDS', openDrawer: true, printsCustomerTicket: true }));
    expect(k.ok && k.value).toMatchObject({ openDrawer: false, printsCustomerTicket: false });
  });
});

describe('agentes y conexiones', () => {
  it('agentHandles por tipo de cliente', () => {
    expect(agentHandles('agent', 'NETWORK')).toBe(true);
    expect(agentHandles('desktop', 'WINDOWS_PRINTER')).toBe(true);
    expect(agentHandles('agent', 'BLUETOOTH')).toBe(false);
    expect(agentHandles('android', 'BLUETOOTH')).toBe(true);
    expect(agentHandles('android', 'NETWORK')).toBe(false);
    expect(agentHandles('agent', 'KDS')).toBe(false);
  });
  it('listConnections marca disponibles por plataforma', () => {
    const web = listConnections('web');
    expect(web.find((c) => c.value === 'BROWSER')!.available).toBe(true);
    expect(web.find((c) => c.value === 'BLUETOOTH')!.available).toBe(false);
    expect(listConnections('android').find((c) => c.value === 'BLUETOOTH')!.available).toBe(true);
    expect(listConnections('desktop').find((c) => c.value === 'WINDOWS_PRINTER')!).toMatchObject({ available: true, requiresAgent: true, handler: 'AGENT' });
  });
  it('backoff creciente', () => {
    expect([1, 2, 3].map(retryDelayMs)).toEqual([5_000, 20_000, 60_000]);
  });
});
