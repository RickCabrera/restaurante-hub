// Biblioteca de íconos de insumos (claves estables).
// La web dibuja cada clave como SVG grande (apps/web/src/icons/supplies). La API y el seed solo guardan la clave.

export interface SupplyIconDef {
  key: string;
  label: string;
  group: 'verdura' | 'fruta' | 'carne' | 'lacteo' | 'abarrote' | 'bebida' | 'barra' | 'desechable' | 'limpieza' | 'servicio' | 'panaderia' | 'especia' | 'otro';
  tags?: string[];
}

export const SUPPLY_ICONS: SupplyIconDef[] = [
  // Verduras
  { key: 'tomato', label: 'Jitomate', group: 'verdura', tags: ['tomate', 'saladet', 'bola'] },
  { key: 'green-tomato', label: 'Tomate verde', group: 'verdura', tags: ['tomatillo'] },
  { key: 'onion', label: 'Cebolla', group: 'verdura', tags: ['morada', 'blanca'] },
  { key: 'garlic', label: 'Ajo', group: 'verdura' },
  { key: 'chili', label: 'Chile', group: 'verdura', tags: ['serrano', 'jalapeño', 'habanero'] },
  { key: 'bell-pepper', label: 'Pimiento', group: 'verdura', tags: ['morrón'] },
  { key: 'avocado', label: 'Aguacate', group: 'verdura' },
  { key: 'lettuce', label: 'Lechuga', group: 'verdura', tags: ['romana', 'orejona'] },
  { key: 'cabbage', label: 'Col', group: 'verdura', tags: ['repollo'] },
  { key: 'carrot', label: 'Zanahoria', group: 'verdura' },
  { key: 'potato', label: 'Papa', group: 'verdura' },
  { key: 'cucumber', label: 'Pepino', group: 'verdura' },
  { key: 'cilantro', label: 'Cilantro', group: 'verdura', tags: ['perejil', 'hierbas'] },
  { key: 'corn', label: 'Elote', group: 'verdura', tags: ['maíz'] },
  { key: 'mushroom', label: 'Champiñón', group: 'verdura', tags: ['hongo'] },
  { key: 'broccoli', label: 'Brócoli', group: 'verdura' },
  { key: 'zucchini', label: 'Calabaza', group: 'verdura', tags: ['calabacita'] },
  { key: 'radish', label: 'Rábano', group: 'verdura' },
  { key: 'eggplant', label: 'Berenjena', group: 'verdura' },
  { key: 'nopal', label: 'Nopal', group: 'verdura' },
  // Frutas
  { key: 'lemon', label: 'Limón', group: 'fruta' },
  { key: 'orange', label: 'Naranja', group: 'fruta' },
  { key: 'banana', label: 'Plátano', group: 'fruta' },
  { key: 'apple', label: 'Manzana', group: 'fruta' },
  { key: 'pineapple', label: 'Piña', group: 'fruta' },
  { key: 'strawberry', label: 'Fresa', group: 'fruta' },
  { key: 'mango', label: 'Mango', group: 'fruta' },
  { key: 'watermelon', label: 'Sandía', group: 'fruta' },
  { key: 'grapes', label: 'Uvas', group: 'fruta' },
  { key: 'coconut', label: 'Coco', group: 'fruta' },
  // Carnes y mariscos
  { key: 'chicken', label: 'Pollo', group: 'carne', tags: ['pechuga', 'pierna', 'alitas'] },
  { key: 'beef', label: 'Res', group: 'carne', tags: ['bistec', 'arrachera', 'molida'] },
  { key: 'pork', label: 'Cerdo', group: 'carne', tags: ['pastor', 'chuleta'] },
  { key: 'bacon', label: 'Tocino', group: 'carne' },
  { key: 'sausage', label: 'Salchicha', group: 'carne', tags: ['chorizo'] },
  { key: 'ham', label: 'Jamón', group: 'carne' },
  { key: 'fish', label: 'Pescado', group: 'carne', tags: ['filete'] },
  { key: 'shrimp', label: 'Camarón', group: 'carne' },
  { key: 'egg', label: 'Huevo', group: 'carne' },
  { key: 'wings', label: 'Alitas', group: 'carne' },
  { key: 'burger-patty', label: 'Carne hamburguesa', group: 'carne' },
  // Lácteos
  { key: 'milk', label: 'Leche', group: 'lacteo' },
  { key: 'cheese', label: 'Queso', group: 'lacteo', tags: ['manchego', 'oaxaca', 'panela'] },
  { key: 'cream', label: 'Crema', group: 'lacteo' },
  { key: 'butter', label: 'Mantequilla', group: 'lacteo' },
  { key: 'yogurt', label: 'Yogurt', group: 'lacteo' },
  { key: 'ice-cream', label: 'Helado', group: 'lacteo', tags: ['nieve'] },
  // Abarrotes
  { key: 'rice', label: 'Arroz', group: 'abarrote' },
  { key: 'beans', label: 'Frijol', group: 'abarrote' },
  { key: 'flour', label: 'Harina', group: 'abarrote' },
  { key: 'sugar', label: 'Azúcar', group: 'abarrote' },
  { key: 'salt', label: 'Sal', group: 'abarrote' },
  { key: 'oil', label: 'Aceite', group: 'abarrote' },
  { key: 'pasta', label: 'Pasta', group: 'abarrote', tags: ['spaghetti'] },
  { key: 'tortilla', label: 'Tortillas', group: 'abarrote', tags: ['maíz', 'harina'] },
  { key: 'canned', label: 'Lata', group: 'abarrote', tags: ['enlatado', 'chipotle', 'atún'] },
  { key: 'sauce', label: 'Salsa', group: 'abarrote', tags: ['catsup', 'valentina'] },
  { key: 'mayo', label: 'Mayonesa', group: 'abarrote' },
  { key: 'mustard', label: 'Mostaza', group: 'abarrote' },
  { key: 'vinegar', label: 'Vinagre', group: 'abarrote' },
  { key: 'honey', label: 'Miel', group: 'abarrote' },
  { key: 'chocolate', label: 'Chocolate', group: 'abarrote' },
  { key: 'coffee', label: 'Café', group: 'abarrote' },
  { key: 'tea', label: 'Té', group: 'abarrote' },
  { key: 'cereal', label: 'Cereal', group: 'abarrote' },
  { key: 'nuts', label: 'Nueces', group: 'abarrote', tags: ['cacahuate', 'almendra'] },
  { key: 'chips', label: 'Totopos', group: 'abarrote', tags: ['papas', 'frituras'] },
  // Panadería
  { key: 'bread', label: 'Pan', group: 'panaderia', tags: ['bolillo', 'telera'] },
  { key: 'burger-bun', label: 'Pan hamburguesa', group: 'panaderia' },
  { key: 'hotdog-bun', label: 'Pan hot dog', group: 'panaderia' },
  { key: 'croissant', label: 'Cuernito', group: 'panaderia' },
  { key: 'cake', label: 'Pastel', group: 'panaderia' },
  // Especias
  { key: 'pepper', label: 'Pimienta', group: 'especia' },
  { key: 'oregano', label: 'Orégano', group: 'especia' },
  { key: 'spices', label: 'Especias', group: 'especia', tags: ['comino', 'consomé', 'sazonador'] },
  // Bebidas
  { key: 'water-jug', label: 'Garrafón', group: 'bebida', tags: ['agua'] },
  { key: 'water-bottle', label: 'Agua embotellada', group: 'bebida' },
  { key: 'soda', label: 'Refresco', group: 'bebida', tags: ['coca'] },
  { key: 'juice', label: 'Jugo', group: 'bebida' },
  { key: 'mineral-water', label: 'Agua mineral', group: 'bebida' },
  { key: 'energy-drink', label: 'Bebida energética', group: 'bebida' },
  // Barra
  { key: 'beer', label: 'Cerveza', group: 'barra' },
  { key: 'beer-keg', label: 'Barril', group: 'barra' },
  { key: 'tequila', label: 'Tequila', group: 'barra', tags: ['mezcal', 'licor'] },
  { key: 'wine', label: 'Vino', group: 'barra' },
  { key: 'whisky', label: 'Whisky', group: 'barra', tags: ['ron', 'vodka'] },
  { key: 'ice', label: 'Hielo', group: 'barra' },
  { key: 'syrup', label: 'Jarabe', group: 'barra', tags: ['granadina', 'mix'] },
  { key: 'clamato', label: 'Clamato', group: 'barra' },
  { key: 'mint', label: 'Hierbabuena', group: 'barra', tags: ['menta'] },
  // Desechables
  { key: 'cup', label: 'Vasos', group: 'desechable' },
  { key: 'lid', label: 'Tapas', group: 'desechable' },
  { key: 'straw', label: 'Popotes', group: 'desechable' },
  { key: 'napkins', label: 'Servilletas', group: 'desechable' },
  { key: 'container', label: 'Contenedor', group: 'desechable', tags: ['charola', 'unicel'] },
  { key: 'bag', label: 'Bolsas', group: 'desechable' },
  { key: 'foil', label: 'Aluminio', group: 'desechable', tags: ['papel'] },
  { key: 'plastic-wrap', label: 'Plástico', group: 'desechable', tags: ['emplaye'] },
  { key: 'cutlery', label: 'Cubiertos', group: 'desechable' },
  { key: 'plate', label: 'Platos', group: 'desechable' },
  { key: 'gloves', label: 'Guantes', group: 'desechable' },
  { key: 'paper-roll', label: 'Rollo de papel', group: 'desechable', tags: ['ticket', 'térmico'] },
  { key: 'pizza-box', label: 'Caja pizza', group: 'desechable' },
  // Limpieza
  { key: 'detergent', label: 'Detergente', group: 'limpieza', tags: ['jabón'] },
  { key: 'dish-soap', label: 'Lavatrastes', group: 'limpieza' },
  { key: 'bleach', label: 'Cloro', group: 'limpieza' },
  { key: 'sponge', label: 'Fibra', group: 'limpieza', tags: ['esponja'] },
  { key: 'trash-bag', label: 'Bolsa basura', group: 'limpieza' },
  { key: 'toilet-paper', label: 'Papel higiénico', group: 'limpieza' },
  { key: 'mop', label: 'Trapeador', group: 'limpieza' },
  { key: 'disinfectant', label: 'Desinfectante', group: 'limpieza', tags: ['pinol', 'fabuloso'] },
  // Servicios
  { key: 'gas', label: 'Gas', group: 'servicio', tags: ['tanque', 'cilindro'] },
  { key: 'charcoal', label: 'Carbón', group: 'servicio' },
  { key: 'lightbulb', label: 'Foco', group: 'servicio' },
  { key: 'battery', label: 'Pilas', group: 'servicio' },
  { key: 'tools', label: 'Mantenimiento', group: 'servicio', tags: ['reparación'] },
  // Otros
  { key: 'box', label: 'Caja', group: 'otro' },
  { key: 'sack', label: 'Costal', group: 'otro' },
  { key: 'jar', label: 'Bote', group: 'otro' },
  { key: 'bottle', label: 'Botella', group: 'otro' },
  { key: 'package', label: 'Paquete', group: 'otro' },
];

export const SUPPLY_ICON_KEYS = SUPPLY_ICONS.map((i) => i.key);

/** Íconos de categoría / área (lucide-react compatibles en la web). */
export const AREA_ICONS = ['chef', 'wine', 'warehouse', 'coffee', 'pizza', 'beef', 'fish', 'ice-cream', 'store', 'truck'] as const;
