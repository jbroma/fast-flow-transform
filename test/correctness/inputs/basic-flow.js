// @flow
import type { Node } from "./types.js";
const value: Node = { id: 1 };
export function read(node: Node): number {
  return node.id;
}
export default value.id;
