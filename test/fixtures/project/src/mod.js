// @flow
import type { Label } from './types.js';

type Multiplier = (input: number) => number;

const multiply: Multiplier = (input: number): number => input * 2;

export function doubleValue(input: number): number {
	return multiply(input);
}

export function buildLabel(value: Label): string {
	return `value:${value.label}`;
}
