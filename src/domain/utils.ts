export function sum(values: Array<number | null | undefined>): number | null {
  const present = values.filter((value): value is number => value !== null && value !== undefined);
  if (present.length === 0) {
    return null;
  }

  return round(present.reduce((total, value) => total + value, 0));
}

export function average(values: Array<number | null | undefined>): number | null {
  const present = values.filter((value): value is number => value !== null && value !== undefined);
  if (present.length === 0) {
    return null;
  }

  return round(present.reduce((total, value) => total + value, 0) / present.length);
}

export function safeDivide(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
): number | null {
  if (numerator === null || numerator === undefined) {
    return null;
  }

  if (denominator === null || denominator === undefined || denominator === 0) {
    return null;
  }

  return round(numerator / denominator);
}

export function round(value: number, precision = 4): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export function keyBy<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

export function asMonth(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
