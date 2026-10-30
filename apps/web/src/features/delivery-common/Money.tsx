/**
 * delivery-common/Money — Input de dinero en pesos que entrega centavos.
 *
 * Exporta:
 * - `<MoneyInput label? hint? valueCents onChangeCents(cents|null) placeholder? allowEmpty? className? />`
 *   Muestra "$" al inicio; acepta decimales; `null` cuando está vacío.
 */
import { useEffect, useState } from 'react';
import { Field } from '@/ui';
import { centsToPesosInput, pesosToCentsInput } from './format';

export function MoneyInput({
  label,
  hint,
  valueCents,
  onChangeCents,
  placeholder = '0',
  className,
  id,
}: {
  label?: string;
  hint?: string;
  valueCents: number | null | undefined;
  onChangeCents: (c: number | null) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}) {
  const [text, setText] = useState(centsToPesosInput(valueCents));
  useEffect(() => {
    if (pesosToCentsInput(text) !== (valueCents ?? null)) setText(centsToPesosInput(valueCents));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueCents]);
  return (
    <Field label={label} hint={hint} className={className}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-mute">$</span>
        <input
          id={id}
          className="input pl-7 tabular-nums"
          inputMode="decimal"
          placeholder={placeholder}
          value={text}
          onChange={(e) => {
            const v = e.target.value.replace(/[^\d.]/g, '');
            setText(v);
            onChangeCents(pesosToCentsInput(v));
          }}
        />
      </div>
    </Field>
  );
}
