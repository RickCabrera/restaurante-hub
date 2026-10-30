import { describeInbound, parseMetaWebhook } from './webhook-parser';

const wrap = (value: unknown) => ({ object: 'whatsapp_business_account', entry: [{ id: 'WABA', changes: [{ field: 'messages', value }] }] });
const meta = { messaging_product: 'whatsapp', metadata: { display_phone_number: '15550000000', phone_number_id: 'PNID' } };
const contacts = [{ profile: { name: 'Ana' }, wa_id: '5215512345678' }];

describe('parseMetaWebhook', () => {
  it('texto, botones, listas y ubicación', () => {
    const ev = parseMetaWebhook(wrap({
      ...meta,
      contacts,
      messages: [
        { from: '5215512345678', id: 'w1', timestamp: '1761800000', type: 'text', text: { body: 'Hola' } },
        { from: '5215512345678', id: 'w2', timestamp: '1761800001', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'm:order', title: '🛒 Hacer pedido' } } },
        { from: '5215512345678', id: 'w3', timestamp: '1761800002', type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'c:1', title: 'Tacos' } } },
        { from: '5215512345678', id: 'w4', timestamp: '1761800003', type: 'location', location: { latitude: 19.44, longitude: -99.14, name: 'Casa', address: 'Madero 1' } },
        { from: '5215512345678', id: 'w5', timestamp: '1761800004', type: 'image', image: { id: 'img', caption: 'comprobante' } },
        { from: '5215512345678', id: 'w6', timestamp: '1761800005', type: 'button', button: { text: 'Ver pedido', payload: 'x' } },
        { from: '5215512345678', id: 'w7', timestamp: '1761800006', type: 'reaction', reaction: { emoji: '👍' } },
      ],
    }));
    expect(ev).toHaveLength(6);
    expect(ev[0]).toMatchObject({ type: 'message', phoneNumberId: 'PNID', from: '5215512345678', profileName: 'Ana', waMessageId: 'w1', inbound: { kind: 'text', text: 'Hola' } });
    expect(ev[1]).toMatchObject({ inbound: { kind: 'button', id: 'm:order' }, body: '🛒 Hacer pedido' });
    expect(ev[2]).toMatchObject({ inbound: { kind: 'list', id: 'c:1' } });
    expect(ev[3]).toMatchObject({ inbound: { kind: 'location', lat: 19.44, lng: -99.14, address: 'Madero 1', name: 'Casa' } });
    expect(ev[4]).toMatchObject({ inbound: { kind: 'image', caption: 'comprobante' } });
    expect(ev[5]).toMatchObject({ inbound: { kind: 'text', text: 'Ver pedido' } });
  });

  it('estados de mensajes salientes', () => {
    const ev = parseMetaWebhook(wrap({ ...meta, statuses: [{ id: 'out1', status: 'failed', timestamp: '1761800000', recipient_id: '52155', errors: [{ code: 131047, title: 'Re-engagement message' }] }] }));
    expect(ev[0]).toMatchObject({ type: 'status', waMessageId: 'out1', status: 'failed', error: '131047 Re-engagement message' });
  });

  it('ignora payloads ajenos', () => {
    expect(parseMetaWebhook({ object: 'page' })).toEqual([]);
    expect(parseMetaWebhook(null)).toEqual([]);
  });

  it('describe mensajes', () => {
    expect(describeInbound({ kind: 'location', lat: 1, lng: 2, address: 'Madero 1' })).toBe('📍 Madero 1');
    expect(describeInbound({ kind: 'button', id: 'x', title: 'Sí' })).toBe('Sí');
  });
});
