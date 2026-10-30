import { verdura } from './paths/verdura';
import { fruta } from './paths/fruta';
import { carne } from './paths/carne';
import { lacteo } from './paths/lacteo';
import { abarrote } from './paths/abarrote';
import { panaderia } from './paths/panaderia';
import { especia } from './paths/especia';
import { bebida } from './paths/bebida';
import { barra } from './paths/barra';
import { desechable } from './paths/desechable';
import { limpieza } from './paths/limpieza';
import { servicio } from './paths/servicio';
import { otro } from './paths/otro';

/** Todas las ilustraciones de insumos: clave estable → contenido SVG (viewBox 0 0 64 64). */
export const SUPPLY_ICON_SVGS: Record<string, JSX.Element> = {
  ...verdura,
  ...fruta,
  ...carne,
  ...lacteo,
  ...abarrote,
  ...panaderia,
  ...especia,
  ...bebida,
  ...barra,
  ...desechable,
  ...limpieza,
  ...servicio,
  ...otro,
};

export function hasSupplyIcon(key: string | null | undefined): key is string {
  return !!key && Object.prototype.hasOwnProperty.call(SUPPLY_ICON_SVGS, key);
}
