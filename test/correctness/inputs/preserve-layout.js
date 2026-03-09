import type { Node } from "./types.js";

const value: number = 1;

// preserve this comment
export function read(
  node: Node,
): number {
  return value + node.id;
}
