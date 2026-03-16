import type /* ambiguous */ { Ambiguous } from "./types.js";
import type { Node } from "./types.js";
import { Foo, type Bar } from "./types.js";
import DefaultThing, { type Qux } from "./types.js";
import { type OnlyType } from "./types.js";

/* eslint-disable no-console */
// moved comment
type User = string;

const value: /* inline */ number = 1; // trailing keep
const aliasValue: User = "x";
const nodeValue: Node = { id: 1 };

// preserve this comment
export function read(
  node: Node,
): number {
  return value + node.id + nodeValue.id + aliasValue.length;
}

class Example extends Base implements FooInterface, BarInterface {
  declare removed: string;
  kept: number = 1;
  +covariant: number = 2;
  prop: string;
  #hidden: number;
  #kept: number = 3;
}

function useThis(this: Context, value: number) {
  return (value: mixed);
}

const typed = DefaultThing as number;
const frozen = ({ ok: true } as const);

export default value + nodeValue.id;
export const extras = { Example, Foo, read, useThis, typed, frozen };
