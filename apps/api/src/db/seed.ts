/* eslint-disable no-console */
// Datos de demostración: negocio, áreas, usuarios de cada rol, 60+ insumos con íconos,
// menú con modificadores, zonas de reparto, impresoras y mesas.
// Uso: pnpm db:seed   (idempotente: si el negocio "demo" existe, no hace nada; SEED_RESET=1 lo recrea)
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { createDb } from './db.module';
import * as s from './schema';

const SLUG = process.env.SEED_SLUG ?? 'demo';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL no está definida');
  const { db, pool } = createDb(url);

  const existing = await db.query.businesses.findFirst({ where: eq(s.businesses.slug, SLUG) });
  if (existing && process.env.SEED_RESET !== '1') {
    console.log(`[seed] El negocio "${SLUG}" ya existe. Usa SEED_RESET=1 para recrearlo.`);
    await pool.end();
    return;
  }
  if (existing) await db.delete(s.businesses).where(eq(s.businesses.id, existing.id));

  const hash = (p: string) => bcrypt.hashSync(p, 10);

  const [biz] = await db
    .insert(s.businesses)
    .values({
      name: 'La Cocina de Doña Mary',
      slug: SLUG,
      phone: '5512345678',
      address: 'Av. Reforma 123, Col. Centro, CDMX',
      settings: {
        modules: { requisitions: true, delivery: true, pos: true },
        requirePin: false,
        groupWindowMinutes: 0,
        tips: [10, 15, 20],
        ticketFooter: '¡Gracias por su preferencia!',
        transferInfo: 'BBVA · CLABE 012180001234567890 · A nombre de María López',
        ownerWhatsapp: '5215512345678',
        notifyOwnerByWhatsapp: false,
        urgentEscalationMinutes: 10,
        dailySummaryHour: 23,
        loyalty: { enabled: true, everyOrders: 5, discountType: 'PERCENT', value: 15 },
      },
    })
    .returning();

  const allDay = { open: '09:00', close: '23:00' };
  const [branch] = await db
    .insert(s.branches)
    .values({
      businessId: biz.id,
      name: 'Sucursal Centro',
      address: biz.address,
      phone: biz.phone,
      lat: 19.4326,
      lng: -99.1332,
      hours: { '0': [allDay], '1': [allDay], '2': [allDay], '3': [allDay], '4': [allDay], '5': [allDay], '6': [allDay] },
      prepMinutes: 25,
    })
    .returning();

  const [cocina, barra, almacen] = await db
    .insert(s.areas)
    .values([
      { businessId: biz.id, branchId: branch.id, name: 'Cocina', color: '#E85D04', icon: 'chef', sortOrder: 1, isProduction: true, canRequisition: true, orderWindow: { '1': { until: '18:00' }, '2': { until: '18:00' }, '3': { until: '18:00' }, '4': { until: '18:00' }, '5': { until: '18:00' } } },
      { businessId: biz.id, branchId: branch.id, name: 'Barra', color: '#7B2CBF', icon: 'wine', sortOrder: 2, isProduction: true, canRequisition: true },
      { businessId: biz.id, branchId: branch.id, name: 'Almacén', color: '#2A9D8F', icon: 'warehouse', sortOrder: 3, isProduction: false, canRequisition: true },
    ])
    .returning();

  const pin = hash('1234');
  const users = await db
    .insert(s.users)
    .values([
      { businessId: biz.id, name: 'María (Dueña)', email: 'duena@demo.mx', phone: '5512345678', passwordHash: hash('demo1234'), pinHash: hash('0000'), role: 'OWNER', avatarColor: '#E85D04' },
      { businessId: biz.id, name: 'Laura Admin', email: 'admin@demo.mx', passwordHash: hash('demo1234'), pinHash: hash('1111'), role: 'ADMIN', avatarColor: '#1D3557' },
      { businessId: biz.id, name: 'Chef Pedro', email: 'pedro@demo.mx', passwordHash: hash('demo1234'), pinHash: pin, role: 'AREA_LEAD', avatarColor: '#F4A261' },
      { businessId: biz.id, name: 'Ana Cocina', pinHash: hash('2222'), role: 'STAFF', avatarColor: '#E76F51' },
      { businessId: biz.id, name: 'Luis Barra', email: 'luis@demo.mx', passwordHash: hash('demo1234'), pinHash: hash('3333'), role: 'AREA_LEAD', avatarColor: '#7B2CBF' },
      { businessId: biz.id, name: 'Sofía Caja', email: 'caja@demo.mx', passwordHash: hash('demo1234'), pinHash: hash('4444'), role: 'CASHIER', avatarColor: '#2A9D8F' },
      { businessId: biz.id, name: 'Jorge Mesero', email: 'mesero@demo.mx', passwordHash: hash('demo1234'), pinHash: hash('5555'), role: 'WAITER', avatarColor: '#264653' },
      { businessId: biz.id, name: 'Carlos Repartidor', email: 'repartidor@demo.mx', phone: '5587654321', passwordHash: hash('demo1234'), role: 'DRIVER', avatarColor: '#E9C46A' },
    ])
    .returning();
  const byName = (n: string) => users.find((u) => u.name.startsWith(n))!;
  await db.insert(s.userAreas).values([
    { userId: byName('Chef Pedro').id, areaId: cocina.id },
    { userId: byName('Ana').id, areaId: cocina.id },
    { userId: byName('Luis').id, areaId: barra.id },
    { userId: byName('Luis').id, areaId: almacen.id },
  ]);

  // ---------------- Proveedores y categorías ----------------
  const suppliers = await db
    .insert(s.suppliers)
    .values([
      { businessId: biz.id, name: 'Verdulería Don José', phone: '5511112222', deliveryDays: [1, 3, 5] },
      { businessId: biz.id, name: 'Carnicería El Toro', phone: '5522223333', deliveryDays: [2, 4, 6] },
      { businessId: biz.id, name: 'Abarrotes La Central', phone: '5533334444', deliveryDays: [1, 4] },
      { businessId: biz.id, name: 'Cervecería y Licores', phone: '5544445555', deliveryDays: [5] },
      { businessId: biz.id, name: 'Desechables y Limpieza', phone: '5555556666', deliveryDays: [2] },
      { businessId: biz.id, name: 'Gas y Servicios', phone: '5566667777', deliveryDays: [] },
    ])
    .returning();
  const sup = (n: string) => suppliers.find((x) => x.name.startsWith(n))!.id;

  const cats = await db
    .insert(s.supplyCategories)
    .values([
      { businessId: biz.id, name: 'Verdura y fruta', icon: 'tomato', sortOrder: 1 },
      { businessId: biz.id, name: 'Carnes', icon: 'beef', sortOrder: 2 },
      { businessId: biz.id, name: 'Lácteos', icon: 'cheese', sortOrder: 3 },
      { businessId: biz.id, name: 'Abarrotes', icon: 'rice', sortOrder: 4 },
      { businessId: biz.id, name: 'Bebidas', icon: 'soda', sortOrder: 5 },
      { businessId: biz.id, name: 'Barra', icon: 'beer', sortOrder: 6 },
      { businessId: biz.id, name: 'Desechables', icon: 'container', sortOrder: 7 },
      { businessId: biz.id, name: 'Limpieza', icon: 'detergent', sortOrder: 8 },
      { businessId: biz.id, name: 'Gas y servicios', icon: 'gas', sortOrder: 9 },
    ])
    .returning();
  const cat = (n: string) => cats.find((c) => c.name.startsWith(n))!.id;

  type U = (typeof s.unitEnum.enumValues)[number];
  type Row = [name: string, icon: string, unit: U, step: number, category: string, supplier: string, areas: ('C' | 'B' | 'A')[], autoApprove?: boolean];
  const rows: Row[] = [
    ['Jitomate', 'tomato', 'KG', 1, 'Verdura', 'Verdulería', ['C']],
    ['Tomate verde', 'green-tomato', 'KG', 1, 'Verdura', 'Verdulería', ['C']],
    ['Cebolla blanca', 'onion', 'KG', 1, 'Verdura', 'Verdulería', ['C', 'B']],
    ['Ajo', 'garlic', 'KG', 0.5, 'Verdura', 'Verdulería', ['C']],
    ['Chile serrano', 'chili', 'KG', 0.5, 'Verdura', 'Verdulería', ['C']],
    ['Aguacate', 'avocado', 'KG', 1, 'Verdura', 'Verdulería', ['C']],
    ['Lechuga romana', 'lettuce', 'PIEZA', 1, 'Verdura', 'Verdulería', ['C']],
    ['Papa', 'potato', 'KG', 1, 'Verdura', 'Verdulería', ['C']],
    ['Zanahoria', 'carrot', 'KG', 1, 'Verdura', 'Verdulería', ['C']],
    ['Pepino', 'cucumber', 'KG', 1, 'Verdura', 'Verdulería', ['C', 'B']],
    ['Cilantro', 'cilantro', 'MANOJO', 1, 'Verdura', 'Verdulería', ['C']],
    ['Champiñón', 'mushroom', 'KG', 0.5, 'Verdura', 'Verdulería', ['C']],
    ['Limón', 'lemon', 'KG', 1, 'Verdura', 'Verdulería', ['C', 'B']],
    ['Naranja', 'orange', 'KG', 1, 'Verdura', 'Verdulería', ['B']],
    ['Piña', 'pineapple', 'PIEZA', 1, 'Verdura', 'Verdulería', ['B']],
    ['Pechuga de pollo', 'chicken', 'KG', 1, 'Carnes', 'Carnicería', ['C']],
    ['Alitas', 'wings', 'KG', 1, 'Carnes', 'Carnicería', ['C']],
    ['Arrachera', 'beef', 'KG', 1, 'Carnes', 'Carnicería', ['C']],
    ['Carne molida', 'burger-patty', 'KG', 1, 'Carnes', 'Carnicería', ['C']],
    ['Pastor', 'pork', 'KG', 1, 'Carnes', 'Carnicería', ['C']],
    ['Tocino', 'bacon', 'KG', 0.5, 'Carnes', 'Carnicería', ['C']],
    ['Chorizo', 'sausage', 'KG', 0.5, 'Carnes', 'Carnicería', ['C']],
    ['Camarón', 'shrimp', 'KG', 1, 'Carnes', 'Carnicería', ['C']],
    ['Huevo', 'egg', 'CAJA', 1, 'Carnes', 'Abarrotes', ['C']],
    ['Queso Oaxaca', 'cheese', 'KG', 1, 'Lácteos', 'Abarrotes', ['C']],
    ['Queso manchego', 'cheese', 'KG', 1, 'Lácteos', 'Abarrotes', ['C']],
    ['Crema', 'cream', 'L', 1, 'Lácteos', 'Abarrotes', ['C']],
    ['Leche', 'milk', 'L', 1, 'Lácteos', 'Abarrotes', ['C', 'B']],
    ['Mantequilla', 'butter', 'KG', 0.5, 'Lácteos', 'Abarrotes', ['C']],
    ['Arroz', 'rice', 'KG', 1, 'Abarrotes', 'Abarrotes', ['C', 'A']],
    ['Frijol', 'beans', 'KG', 1, 'Abarrotes', 'Abarrotes', ['C', 'A']],
    ['Aceite', 'oil', 'L', 1, 'Abarrotes', 'Abarrotes', ['C', 'A']],
    ['Harina', 'flour', 'KG', 1, 'Abarrotes', 'Abarrotes', ['C', 'A']],
    ['Azúcar', 'sugar', 'KG', 1, 'Abarrotes', 'Abarrotes', ['C', 'B', 'A']],
    ['Sal', 'salt', 'KG', 1, 'Abarrotes', 'Abarrotes', ['C', 'A'], true],
    ['Tortillas de maíz', 'tortilla', 'KG', 1, 'Abarrotes', 'Abarrotes', ['C']],
    ['Pan para hamburguesa', 'burger-bun', 'PAQUETE', 1, 'Abarrotes', 'Abarrotes', ['C']],
    ['Chipotle en lata', 'canned', 'LATA', 1, 'Abarrotes', 'Abarrotes', ['C', 'A']],
    ['Catsup', 'sauce', 'BOTE', 1, 'Abarrotes', 'Abarrotes', ['C', 'A']],
    ['Mayonesa', 'mayo', 'BOTE', 1, 'Abarrotes', 'Abarrotes', ['C', 'A']],
    ['Café', 'coffee', 'KG', 1, 'Abarrotes', 'Abarrotes', ['B']],
    ['Totopos', 'chips', 'BOLSA', 1, 'Abarrotes', 'Abarrotes', ['C', 'B']],
    ['Garrafón de agua', 'water-jug', 'GARRAFON', 1, 'Bebidas', 'Abarrotes', ['C', 'B'], true],
    ['Refresco de cola', 'soda', 'CAJA', 1, 'Bebidas', 'Abarrotes', ['B', 'A']],
    ['Agua mineral', 'mineral-water', 'CAJA', 1, 'Bebidas', 'Abarrotes', ['B', 'A']],
    ['Jugo de naranja', 'juice', 'L', 1, 'Bebidas', 'Abarrotes', ['B']],
    ['Cerveza clara', 'beer', 'CAJA', 1, 'Barra', 'Cervecería', ['B', 'A']],
    ['Cerveza oscura', 'beer', 'CAJA', 1, 'Barra', 'Cervecería', ['B', 'A']],
    ['Tequila', 'tequila', 'BOTELLA', 1, 'Barra', 'Cervecería', ['B']],
    ['Mezcal', 'tequila', 'BOTELLA', 1, 'Barra', 'Cervecería', ['B']],
    ['Vino tinto', 'wine', 'BOTELLA', 1, 'Barra', 'Cervecería', ['B']],
    ['Hielo', 'ice', 'BOLSA', 1, 'Barra', 'Abarrotes', ['B'], true],
    ['Clamato', 'clamato', 'BOTELLA', 1, 'Barra', 'Cervecería', ['B']],
    ['Jarabe natural', 'syrup', 'BOTELLA', 1, 'Barra', 'Cervecería', ['B']],
    ['Hierbabuena', 'mint', 'MANOJO', 1, 'Barra', 'Verdulería', ['B']],
    ['Vasos desechables', 'cup', 'PAQUETE', 1, 'Desechables', 'Desechables', ['B', 'A']],
    ['Popotes', 'straw', 'PAQUETE', 1, 'Desechables', 'Desechables', ['B']],
    ['Servilletas', 'napkins', 'PAQUETE', 1, 'Desechables', 'Desechables', ['C', 'B', 'A']],
    ['Contenedores para llevar', 'container', 'PAQUETE', 1, 'Desechables', 'Desechables', ['C', 'A']],
    ['Bolsas para llevar', 'bag', 'PAQUETE', 1, 'Desechables', 'Desechables', ['C', 'A']],
    ['Papel aluminio', 'foil', 'ROLLO', 1, 'Desechables', 'Desechables', ['C']],
    ['Guantes', 'gloves', 'CAJA', 1, 'Desechables', 'Desechables', ['C', 'B']],
    ['Rollo de ticket', 'paper-roll', 'ROLLO', 1, 'Desechables', 'Desechables', ['C', 'B', 'A']],
    ['Lavatrastes', 'dish-soap', 'L', 1, 'Limpieza', 'Desechables', ['C', 'B', 'A']],
    ['Cloro', 'bleach', 'L', 1, 'Limpieza', 'Desechables', ['C', 'B', 'A']],
    ['Fibras', 'sponge', 'PAQUETE', 1, 'Limpieza', 'Desechables', ['C', 'B']],
    ['Bolsas de basura', 'trash-bag', 'ROLLO', 1, 'Limpieza', 'Desechables', ['C', 'B', 'A']],
    ['Desinfectante', 'disinfectant', 'L', 1, 'Limpieza', 'Desechables', ['C', 'B', 'A']],
    ['Gas', 'gas', 'TANQUE', 1, 'Gas', 'Gas', ['C']],
    ['Carbón', 'charcoal', 'BOLSA', 1, 'Gas', 'Gas', ['C']],
  ];
  const areaMap = { C: cocina.id, B: barra.id, A: almacen.id };
  const inserted = await db
    .insert(s.supplies)
    .values(
      rows.map((r, i) => ({
        businessId: biz.id, name: r[0], icon: r[1], unit: r[2], step: r[3], categoryId: cat(r[4]),
        supplierId: sup(r[5]), autoApprove: !!r[7], sortOrder: i,
      })),
    )
    .returning();
  await db.insert(s.supplyAreas).values(
    inserted.flatMap((sp, i) => rows[i][6].map((a, j) => ({ supplyId: sp.id, areaId: areaMap[a], sortOrder: i * 10 + j }))),
  );

  await db.insert(s.quickMessages).values([
    { businessId: biz.id, text: 'Se acabó el gas', icon: 'flame', urgent: true, sortOrder: 1 },
    { businessId: biz.id, text: 'Falta hielo', icon: 'snowflake', sortOrder: 2 },
    { businessId: biz.id, text: 'Llegó el proveedor', icon: 'truck', sortOrder: 3 },
    { businessId: biz.id, text: 'Equipo descompuesto', icon: 'wrench', urgent: true, sortOrder: 4 },
    { businessId: biz.id, text: 'Producto en mal estado', icon: 'alert-triangle', sortOrder: 5 },
    { businessId: biz.id, text: '¿Me puedes llamar?', icon: 'phone', sortOrder: 6 },
    { businessId: biz.id, text: 'Urge, por favor', icon: 'siren', urgent: true, sortOrder: 7 },
    { businessId: biz.id, text: 'Recibido, gracias', icon: 'check', sortOrder: 8 },
  ]);

  await db.insert(s.conversations).values([
    { businessId: biz.id, type: 'GENERAL', title: 'Todos' },
    ...[cocina, barra, almacen].map((a) => ({ businessId: biz.id, type: 'AREA_OWNER' as const, areaId: a.id, title: a.name })),
  ]);

  await db.insert(s.requisitionTemplates).values({
    businessId: biz.id, areaId: cocina.id, name: 'Pedido de lunes',
    items: [
      { supplyId: inserted.find((x) => x.name === 'Jitomate')!.id, quantity: 10 },
      { supplyId: inserted.find((x) => x.name === 'Cebolla blanca')!.id, quantity: 5 },
      { supplyId: inserted.find((x) => x.name === 'Pechuga de pollo')!.id, quantity: 8 },
    ],
  });

  // ---------------- Menú ----------------
  const mcats = await db
    .insert(s.menuCategories)
    .values([
      { businessId: biz.id, name: 'Hamburguesas', sortOrder: 1 },
      { businessId: biz.id, name: 'Tacos', sortOrder: 2 },
      { businessId: biz.id, name: 'Alitas', sortOrder: 3 },
      { businessId: biz.id, name: 'Ensaladas', sortOrder: 4 },
      { businessId: biz.id, name: 'Bebidas', sortOrder: 5 },
      { businessId: biz.id, name: 'Cervezas y cócteles', sortOrder: 6 },
      { businessId: biz.id, name: 'Postres', sortOrder: 7 },
    ])
    .returning();
  const mc = (n: string) => mcats.find((c) => c.name.startsWith(n))!.id;

  const [termino, extras, salsas, tortilla, tamano] = await db
    .insert(s.modifierGroups)
    .values([
      { businessId: biz.id, name: 'Término de la carne', minSelect: 1, maxSelect: 1, sortOrder: 1 },
      { businessId: biz.id, name: 'Extras', minSelect: 0, maxSelect: 5, sortOrder: 2 },
      { businessId: biz.id, name: 'Salsa', minSelect: 1, maxSelect: 2, sortOrder: 3 },
      { businessId: biz.id, name: 'Tortilla', minSelect: 1, maxSelect: 1, sortOrder: 4 },
      { businessId: biz.id, name: 'Tamaño', minSelect: 1, maxSelect: 1, sortOrder: 5 },
    ])
    .returning();
  await db.insert(s.modifiers).values([
    { groupId: termino.id, name: 'Término medio', sortOrder: 1 },
    { groupId: termino.id, name: 'Tres cuartos', sortOrder: 2 },
    { groupId: termino.id, name: 'Bien cocida', sortOrder: 3 },
    { groupId: extras.id, name: 'Tocino', priceCents: 2500, sortOrder: 1 },
    { groupId: extras.id, name: 'Queso extra', priceCents: 1500, sortOrder: 2 },
    { groupId: extras.id, name: 'Aguacate', priceCents: 2000, sortOrder: 3 },
    { groupId: extras.id, name: 'Jalapeños', priceCents: 1000, sortOrder: 4 },
    { groupId: salsas.id, name: 'BBQ', sortOrder: 1 },
    { groupId: salsas.id, name: 'Búfalo', sortOrder: 2 },
    { groupId: salsas.id, name: 'Mango habanero', sortOrder: 3 },
    { groupId: salsas.id, name: 'Lemon pepper', sortOrder: 4 },
    { groupId: tortilla.id, name: 'Maíz', sortOrder: 1 },
    { groupId: tortilla.id, name: 'Harina', priceCents: 500, sortOrder: 2 },
    { groupId: tamano.id, name: 'Chico', sortOrder: 1 },
    { groupId: tamano.id, name: 'Grande', priceCents: 1500, sortOrder: 2 },
  ]);

  const prods = await db
    .insert(s.products)
    .values([
      { businessId: biz.id, categoryId: mc('Hamburguesas'), productionAreaId: cocina.id, name: 'Hamburguesa clásica', description: 'Carne de res 180 g, queso, lechuga, jitomate y papas', priceCents: 14900, sortOrder: 1 },
      { businessId: biz.id, categoryId: mc('Hamburguesas'), productionAreaId: cocina.id, name: 'Hamburguesa BBQ', description: 'Con tocino, aros de cebolla y salsa BBQ', priceCents: 16900, sortOrder: 2 },
      { businessId: biz.id, categoryId: mc('Tacos'), productionAreaId: cocina.id, name: 'Tacos al pastor (3)', description: 'Con piña, cebolla y cilantro', priceCents: 7500, sortOrder: 1 },
      { businessId: biz.id, categoryId: mc('Tacos'), productionAreaId: cocina.id, name: 'Tacos de arrachera (3)', description: 'Con guacamole', priceCents: 11500, sortOrder: 2 },
      { businessId: biz.id, categoryId: mc('Alitas'), productionAreaId: cocina.id, name: 'Alitas (10 pzas)', description: 'Con apio, zanahoria y aderezo', priceCents: 15900, sortOrder: 1 },
      { businessId: biz.id, categoryId: mc('Alitas'), productionAreaId: cocina.id, name: 'Boneless (300 g)', priceCents: 14900, sortOrder: 2 },
      { businessId: biz.id, categoryId: mc('Ensaladas'), productionAreaId: cocina.id, name: 'Ensalada César con pollo', priceCents: 12900, sortOrder: 1 },
      { businessId: biz.id, categoryId: mc('Bebidas'), productionAreaId: barra.id, name: 'Limonada natural', priceCents: 4500, sortOrder: 1 },
      { businessId: biz.id, categoryId: mc('Bebidas'), productionAreaId: barra.id, name: 'Refresco', priceCents: 3500, sortOrder: 2 },
      { businessId: biz.id, categoryId: mc('Bebidas'), productionAreaId: barra.id, name: 'Agua de horchata', priceCents: 4000, sortOrder: 3 },
      { businessId: biz.id, categoryId: mc('Cervezas'), productionAreaId: barra.id, name: 'Cerveza nacional', priceCents: 4500, sortOrder: 1, showInWeb: true },
      { businessId: biz.id, categoryId: mc('Cervezas'), productionAreaId: barra.id, name: 'Michelada', priceCents: 7500, sortOrder: 2 },
      { businessId: biz.id, categoryId: mc('Cervezas'), productionAreaId: barra.id, name: 'Margarita', priceCents: 9500, sortOrder: 3 },
      { businessId: biz.id, categoryId: mc('Postres'), productionAreaId: cocina.id, name: 'Pastel de chocolate', priceCents: 6500, sortOrder: 1 },
    ])
    .returning();
  const pr = (n: string) => prods.find((p) => p.name.startsWith(n))!.id;
  await db.insert(s.productModifierGroups).values([
    { productId: pr('Hamburguesa clásica'), groupId: termino.id, sortOrder: 1 },
    { productId: pr('Hamburguesa clásica'), groupId: extras.id, sortOrder: 2 },
    { productId: pr('Hamburguesa BBQ'), groupId: termino.id, sortOrder: 1 },
    { productId: pr('Hamburguesa BBQ'), groupId: extras.id, sortOrder: 2 },
    { productId: pr('Tacos al pastor'), groupId: tortilla.id, sortOrder: 1 },
    { productId: pr('Tacos de arrachera'), groupId: tortilla.id, sortOrder: 1 },
    { productId: pr('Alitas'), groupId: salsas.id, sortOrder: 1 },
    { productId: pr('Boneless'), groupId: salsas.id, sortOrder: 1 },
    { productId: pr('Limonada'), groupId: tamano.id, sortOrder: 1 },
    { productId: pr('Agua de horchata'), groupId: tamano.id, sortOrder: 1 },
  ]);

  await db.insert(s.deliveryZones).values([
    { branchId: branch.id, name: 'Zona 1 (hasta 3 km)', kind: 'RADIUS', radiusKm: 3, feeCents: 2500, minOrderCents: 10000, etaMinutes: 35, priority: 1, color: '#2A9D8F' },
    { branchId: branch.id, name: 'Zona 2 (3 a 6 km)', kind: 'RADIUS', radiusKm: 6, feeCents: 4500, minOrderCents: 15000, freeFromCents: 50000, etaMinutes: 50, priority: 2, color: '#E9C46A' },
  ]);

  await db.insert(s.coupons).values([
    { businessId: biz.id, code: 'BIENVENIDO', description: '10% en tu primer pedido', discountType: 'PERCENT', value: 10, maxDiscountCents: 10000, maxUsesPerCustomer: 1 },
    { businessId: biz.id, code: 'ENVIOGRATIS', description: 'Envío gratis', discountType: 'AMOUNT', value: 0, freeDelivery: true, minOrderCents: 25000 },
  ]);
  await db.insert(s.promotions).values({
    businessId: biz.id, name: 'Martes de tacos 2x1', kind: 'BUY_X_GET_Y', buyQty: 2, getQty: 1, productIds: [pr('Tacos al pastor')], weekdays: [2],
  });

  // ---------------- Impresoras (cubren todos los escenarios) ----------------
  await db.insert(s.printers).values([
    { businessId: biz.id, name: 'Cocina (navegador)', areaId: cocina.id, connection: 'BROWSER', paperWidth: 80, printsCustomerTicket: true },
    { businessId: biz.id, name: 'Barra (pantalla)', areaId: barra.id, connection: 'KDS', paperWidth: 80 },
  ]);

  // ---------------- POS ----------------
  const [salon, terraza] = await db
    .insert(s.diningAreas)
    .values([
      { businessId: biz.id, branchId: branch.id, name: 'Salón', sortOrder: 1 },
      { businessId: biz.id, branchId: branch.id, name: 'Terraza', sortOrder: 2 },
    ])
    .returning();
  await db.insert(s.diningTables).values([
    ...Array.from({ length: 8 }, (_, i) => ({ diningAreaId: salon.id, name: String(i + 1), capacity: i < 4 ? 4 : 2, posX: (i % 4) * 140 + 20, posY: Math.floor(i / 4) * 140 + 20, shape: i % 3 === 0 ? 'round' : 'square' })),
    ...Array.from({ length: 4 }, (_, i) => ({ diningAreaId: terraza.id, name: `T${i + 1}`, capacity: 4, posX: i * 140 + 20, posY: 20 })),
  ]);

  console.log('[seed] Listo ✔');
  console.log('  Dueña:       duena@demo.mx / demo1234');
  console.log('  Admin:       admin@demo.mx / demo1234');
  console.log('  Cajera:      caja@demo.mx / demo1234 (PIN 4444)');
  console.log('  Mesero:      mesero@demo.mx / demo1234 (PIN 5555)');
  console.log('  Repartidor:  repartidor@demo.mx / demo1234');
  console.log('  PIN cocina:  Chef Pedro 1234 · Ana 2222 · Luis (barra) 3333');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
