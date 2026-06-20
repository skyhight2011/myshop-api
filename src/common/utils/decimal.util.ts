import { Decimal } from '@prisma/client/runtime/library';

export function toNumber(value: Decimal | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }

  return typeof value === 'number' ? value : value.toNumber();
}

export function serializeDecimals<T>(value: T): T {
  return serializeUnknown(value) as T;
}

function serializeUnknown(value: unknown): unknown {
  if (value instanceof Decimal) {
    return toNumber(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeUnknown(item));
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, entryValue]) => [
      key,
      serializeUnknown(entryValue),
    ]);

    return Object.fromEntries(entries);
  }

  return value;
}
