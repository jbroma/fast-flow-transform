// @flow
// preserve whitespace benchmark fixture

import type { User, Value } from './types';

type Box<T> = {
  item: T,
};

interface Reader {
  read(input: string): number;
}

const seed: number = 3;
const weights: Array<number> = [1, 2, 3];

function identity<T>(value: T): T {
  return value;
}

function describe(
  user: User,
  value: Value,
): string {
  const box: Box<Value> = {
    item: identity<Value>(value),
  };

  return `${user.name}:${String(box.item.id)}:${String(seed)}`;
}

export function measure(
  { name, id }: { name: string, id: number },
  [first, second]: Array<number>,
): number {
  const total: number = first + second + weights[0];

  // keep this comment for preserveComments benchmarks
  return total + describe({ name, id }, { id: total }).length;
}

export const answer: number = measure(
  { name: 'Ada', id: 1 },
  [4, 5],
);
