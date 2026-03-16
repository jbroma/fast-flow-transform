// @nolint
import * as React from 'react';
// Regular import
import {Something as Something} from 'some-module';
// Regular import with types only
import 'some-module';
// Mixed default and named type only imports
import DefaultImport from 'some-module';
// Import types
// Typed function
async function test(x, y, z = 123) {
  // Typed expression
  return await x;
} /*.*/ /*.*/ /*.*/ /*.*/ /*.*/
// Interface
// Exported interface
// Interface extends
// Implements interface
class Bar extends Other {
  answer = 42;
  covariant = 42;
  method() {
    return;
  }
  }
 /*.*/ // Class Property with default value // Class Property with default value and variance // Class Property // Class Property with variance
// Class expression implements interface
var SomeClass = class BazClass {
  method() {
    return;
  }
  }
;
// Parametric class
class Wrapper {
  get() {
    return this.value;
  }
  map() {
    // do something
    
  }
  }
// Extends Parametric class
class StringWrapper extends Wrapper {} // ...
// Declare class
// Declare function
// Declare interface
// Declare module
// Declare type alias
// Declare variable
// Type alias
// Export type
// Export type *
// Regular export
export {Wrapper as Wrapper};
// Exported type alias
// Object with types within
var someObj = {objMethod() {
  // do nothing.
  
}};
// Example from README
import SomeClassImport from 'some-module';
export class MyClass extends SomeClassImport {
  constructor(value) {
    this.value = value;
  }
  get() {
    return this.value;
  }
  }
// Test async/await functions
async function asyncFunction(input) {
  return await t;
}
// Test read-only data
// Test covariant type variant class with constraint and default.
export class TestClassWithDefault {
  constructor() {}
  }
var newline_arrow = () => 42;
var newline_arrow_2 = () => 42;
// Test calling a function with explicit type arguments
doSomething(3);
doSomething(3);
// Test invoking a constructor with explicit type arguments
new Event();
// Test type union and intersection syntax with leading "operator"
var union;
var intersection;
// Test generic async arrow funcion
const asyncArrow = async () => {};
// Comment type annotations are preserved
var X = {version: '42'}; /*: {
  version: string,
} */
function method(param) {
  // ...
  
} /*: string */ /*: number */
// declared class fields
class MyClassWithDeclare {}
// Comment type includes are not emptied out
class MyClassWithComment {} /*:: prop: string; */
// Inferred predicate
function inferredPredicateWithType(arg) {
  return !!arg;
}
function inferredPredicateWithoutType(arg) {
  return !!arg;
}
// Type guards
function typeGuardFunction(x) {
  return typeof x === 'boolean';
}
const typeGuardArrow = x => typeof x === 'boolean';
function typeGuardInComments(x) {
  return typeof x === 'boolean';
} /*: mixed */ /*: x is boolean */
function typeAssertsFunction1(x) {
  if (typeof x !== 'boolean')
    throw new Error();
}
function typeAssertsFunction2(x) {
  if (!x)
    throw new Error();
}
// Test function with default type parameter
function functionWithDefault() {}
// Opaque types
// Declare export
// `this` params
function thisParam1() {}
function thisParam2(...a) {}
function thisParam3(...a) {}
function thisParam4() {}
function thisParam5(...a) {}
function thisParam6() {}
function thisParam7(a) {}
function thisParam8(a) {
  function thisParam9(a) {}
}
const thisConst1 = function() {};
const thisConst2 = function(...a) {};
const thisConst3 = function(...a) {};
const thisConst4 = function() {};
const thisConst5 = function(a) {};
// `as` cast
const asAny = 'any';
const asArray = [1, 2, 3];
const asBigIntLiteral = 1n;
const asBigInt = 1n;
const asBooleanLiteral = true;
const asBoolean = true;
const asComponent = () => {};
const asComponentGeneric = () => {};
const asComponentGenericWithDefault = () => {};
const asEmpty = {};
const asExists = 'exists';
const asFunction = () => {};
const asFunctionGeneric = () => {};
const asFunctionGenericWithDefault = () => {};
const asKeyof = 'a';
const asMixed = 'mixed';
const asNullable = null;
const asNullLiteral = null;
const asNumberLiteral = 1;
const asNumber = 1;
const asObject = {a: 'a'};
const asParametrizedGeneric = 'generic';
const asStringLiteral = 'literal';
const asString = 'string';
const asSymbol = Symbol('symbol');
const asTuple = ['a', 1];
const asTypeof = 'typeof';
const asUnion = 'union';
const asVoid = undefined;
const asConditional = 'conditional';
const asInterface = {a: 'a', b: 1};
const asInfer = 'infer';
const asIntersection = {a: 'a', b: 1};
const asIndexed = 'indexed';
// `as const`
's';
['s'];
// chained `as`
const chain1 = '1';
const chain2 = '1';
// Enums
const Status = require('flow-enums-runtime').Mirrored(['Draft', 'Published']);
const Label = require('flow-enums-runtime')({Short: 'short', Long: 'long'});
const Signal = require('flow-enums-runtime')({Off: -1, On: 1});
const Flag = require('flow-enums-runtime')({Yes: true, No: false});
const Token = require('flow-enums-runtime')({Start: Symbol('Start'), Stop: Symbol('Stop')});
const Future = require('flow-enums-runtime').Mirrored(['Current', 'Next']);
const status = Status.Draft;
const statusCast = Status.cast('Draft');
const statusName = Status.getName((Status.Published));
const statusMembers = Status.members();
function exhaustiveStatus(value) {
  switch (value) {
  case Status.Draft:
    return 'draft';
  case Status.Published:
    return 'published';
  default:
    return value;
  }
}
// Component syntax
function Avatar({name}) {
  return name;
}
function Profile({ref, title = 'ok', 'data-id': dataId, badge, name, ...rest}) {
  return badge;
}
export function NamedComponent({foo}) {
  return foo;
}
// Hook syntax
function useValue(value) {
  return value;
}
export function useGenericValue(value) {
  return value;
}
export default function useDefaultValue(...values) {
  return values.length;
}
// Match syntax
const matchValue = (()=>{
  const _fft_match_subject_0 = matchInput;
  let _fft_match_done_1 = false;
  let _fft_match_result_2;
  if(!_fft_match_done_1&&(((_fft_match_subject_0)!==null&&typeof (_fft_match_subject_0)==='object')&&(Object.prototype.hasOwnProperty.call(_fft_match_subject_0, 'kind'))&&(((_fft_match_subject_0).kind)==='user')&&(Object.prototype.hasOwnProperty.call(_fft_match_subject_0, 'payload'))&&((((_fft_match_subject_0).payload)!==null&&typeof ((_fft_match_subject_0).payload)==='object')&&(Object.prototype.hasOwnProperty.call((_fft_match_subject_0).payload, 'name'))))){
    const name = ((_fft_match_subject_0).payload).name;
    if(shouldUseName && name.length > 0){
      _fft_match_done_1 = true;
      _fft_match_result_2 = name;
    }
  }
  if(!_fft_match_done_1&&((Array.isArray(_fft_match_subject_0))&&((_fft_match_subject_0).length>=1))){
    const head = (_fft_match_subject_0)[0];
    const tail = (_fft_match_subject_0).slice(1);
    _fft_match_done_1 = true;
    _fft_match_result_2 = head + tail.length;
  }
  if(!_fft_match_done_1&&((Array.isArray(_fft_match_subject_0))&&((_fft_match_subject_0).length>=2)&&(((_fft_match_subject_0)[0])===2)&&(((_fft_match_subject_0)[1])===3))){
    _fft_match_done_1 = true;
    _fft_match_result_2 = 1;
  }
  if(!_fft_match_done_1&&(((_fft_match_subject_0)!==null&&typeof (_fft_match_subject_0)==='object')&&(Object.prototype.hasOwnProperty.call(_fft_match_subject_0, 'foo'))&&((Array.isArray((_fft_match_subject_0).foo))&&(((_fft_match_subject_0).foo).length===1)&&((((_fft_match_subject_0).foo)[0])===1)))){
    const tupleMatch = (_fft_match_subject_0).foo;
    _fft_match_done_1 = true;
    _fft_match_result_2 = tupleMatch.length;
  }
  if(!_fft_match_done_1&&(((_fft_match_subject_0)==='open')||((_fft_match_subject_0)==='closed'))){
    _fft_match_done_1 = true;
    _fft_match_result_2 = 0;
  }
  if(!_fft_match_done_1){
    _fft_match_done_1 = true;
    _fft_match_result_2 = -1;
  }
  return _fft_match_result_2;
})();
{
  const _fft_match_subject_3 = matchStatementInput;
  let _fft_match_done_4 = false;
  if(!_fft_match_done_4&&(((_fft_match_subject_3)!==null&&typeof (_fft_match_subject_3)==='object')&&(Object.prototype.hasOwnProperty.call(_fft_match_subject_3, 'status'))&&(((_fft_match_subject_3).status)==='ok')&&(Object.prototype.hasOwnProperty.call(_fft_match_subject_3, 'value')))){
    const value = (_fft_match_subject_3).value;
    _fft_match_done_4 = true;
     {
      useValue(value);
    }
  }
  if(!_fft_match_done_4&&((Array.isArray(_fft_match_subject_3))&&((_fft_match_subject_3).length>=1)&&(((_fft_match_subject_3)[0])===1))){
    const rest = (_fft_match_subject_3).slice(1);
    _fft_match_done_4 = true;
     {
      useValue((rest.length));
    }
  }
  if(!_fft_match_done_4){
    _fft_match_done_4 = true;
     {
      useValue(0);
    }
  }
}
