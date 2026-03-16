// @flow
import type { ExampleInput } from './types.js';

export function formatExampleMessage(input: ExampleInput): string {
  return `Hello, ${input.name}!`;
}
