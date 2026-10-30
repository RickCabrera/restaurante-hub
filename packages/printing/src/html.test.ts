import { describe, expect, it } from 'vitest';
import { renderHtml, qrSvg } from './html';
import { buildCustomerTicket } from './templates';

describe('renderHtml', () => {
  const ticket = buildCustomerTicket({
    business: { name: 'Tacos <Doña Mary>', footer: '¡Gracias por su preferencia!', logoUrl: 'https://cdn.example.com/logo.png' },
    folio: 'P-0042', createdAt: '2026-10-29T18:00:00.000Z', channelLabel: 'WhatsApp', typeLabel: 'Domicilio',
    customerName: 'Ana Pérez', customerPhone: '5512345678', address: 'Calle 1 #23', mapsUrl: 'https://maps.google.com/?q=19.4,-99.1',
    lines: [{ quantity: 2, name: 'Taco al pastor', totalCents: 5000 }], subtotalCents: 5000, discountCents: 0,
    deliveryFeeCents: 2500, totalCents: 7500, paymentLabel: 'Efectivo',
  }, 58);

  it('genera un documento completo para papel de 58 mm', () => {
    const html = renderHtml(ticket);
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('@page { size: 58mm auto; margin: 0; }');
    expect(html).toContain('<meta charset="utf-8"/>');
    expect(html).toContain('<title>Ticket P-0042</title>');
  });

  it('contiene el texto escapado del ticket', () => {
    const html = renderHtml(ticket);
    expect(html).toContain('PEDIDO P-0042');
    expect(html).toContain('Ana Pérez');
    expect(html).toContain('Tacos &lt;Doña Mary&gt;');
    expect(html).not.toContain('<Doña Mary>');
    expect(html).toContain('$75.00');
  });

  it('dibuja el QR como <svg> e incluye la imagen y el corte', () => {
    const html = renderHtml(ticket);
    expect(html).toMatch(/<svg[^>]*class="qr"/);
    expect(html).toContain('<img src="https://cdn.example.com/logo.png"');
    expect(html).toContain('class="cut"');
  });

  it('80 mm y título personalizado', () => {
    const html = renderHtml({ title: 'x', paperWidth: 80, blocks: [{ type: 'text', text: 'Hola', bold: true, size: 2 }] }, { title: 'Prueba' });
    expect(html).toContain('size: 80mm auto');
    expect(html).toContain('<title>Prueba</title>');
    expect(html).toContain('class="t s2 b"');
  });

  it('ignora imágenes con URL no segura', () => {
    const html = renderHtml({ title: 'x', paperWidth: 80, blocks: [{ type: 'image', url: 'javascript:alert(1)' }] });
    expect(html).not.toContain('javascript:');
  });

  it('qrSvg produce un svg válido', () => {
    const svg = qrSvg('https://ejemplo.mx/ñ');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('<path d="M');
  });
});
