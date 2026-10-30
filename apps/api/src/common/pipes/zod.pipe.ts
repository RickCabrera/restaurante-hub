import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';

/**
 * Valida el body/query con un esquema zod.
 * Uso: @Body(new ZodPipe(MiSchema)) dto: MiDto
 */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw new BadRequestException({
        message: 'Datos inválidos',
        errors: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return r.data;
  }
}

export const zbody = <T>(schema: ZodSchema<T>) => new ZodPipe(schema);
