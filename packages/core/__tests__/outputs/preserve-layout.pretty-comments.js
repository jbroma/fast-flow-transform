import {Foo as Foo} from './types.js';
import DefaultThing from './types.js';
import './types.js';
/* eslint-disable no-console */
// moved comment
const value = 1; /* inline */ // trailing keep
const aliasValue = 'x';
const nodeValue = {id: 1};
// preserve this comment
export function read(node) {
  return value + node.id + nodeValue.id + aliasValue.length;
}
class Example extends Base {
  kept = 1;
  covariant = 2;
  #hidden ;
  #kept = 3;
  }
function useThis(value) {
  return value;
}
const typed = DefaultThing;
const frozen = {ok: true};
export default value + nodeValue.id;
export const extras = {Example, Foo, read, useThis, typed, frozen};
