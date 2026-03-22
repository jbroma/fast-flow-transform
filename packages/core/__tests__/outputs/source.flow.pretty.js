import * as React from 'react';
import {Something as Something} from 'some-module';
import DefaultImport from 'some-module';
async function test(x, y, z = 123) {
  return await x;
}
class Bar extends Other {
  answer = 42;
  covariant = 42;
  method() {
    return;
  }
  }
var SomeClass = class BazClass {
  method() {
    return;
  }
  }
;
class Wrapper {
  get() {
    return this.value;
  }
  map() {}
  }
class StringWrapper extends Wrapper {}
export {Wrapper as Wrapper};
var someObj = {objMethod() {}};
import SomeClassImport from 'some-module';
export class MyClass extends SomeClassImport {
  constructor(value) {
    this.value = value;
  }
  get() {
    return this.value;
  }
  }
async function asyncFunction(input) {
  return await t;
}
export class TestClassWithDefault {
  constructor() {}
  }
var newline_arrow = () => 42;
var newline_arrow_2 = () => 42;
doSomething(3);
doSomething(3);
new Event();
var union;
var intersection;
const asyncArrow = async () => {};
var X = {version: '42'};
function method(param) {}
class MyClassWithDeclare {}
class MyClassWithComment {}
function inferredPredicateWithType(arg) {
  return !!arg;
}
function inferredPredicateWithoutType(arg) {
  return !!arg;
}
function typeGuardFunction(x) {
  return typeof x === 'boolean';
}
const typeGuardArrow = x => typeof x === 'boolean';
function typeGuardInComments(x) {
  return typeof x === 'boolean';
}
function typeAssertsFunction1(x) {
  if (typeof x !== 'boolean')
    throw new Error();
}
function typeAssertsFunction2(x) {
  if (!x)
    throw new Error();
}
function functionWithDefault() {}
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
's';
['s'];
const chain1 = '1';
const chain2 = '1';
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
function Avatar({name}) {
  return name;
}
function Profile({ref, title = 'ok', 'data-id': dataId, badge, name, ...rest}) {
  return badge;
}
export function NamedComponent({foo}) {
  return foo;
}
function useValue(value) {
  return value;
}
export function useGenericValue(value) {
  return value;
}
export default function useDefaultValue(...values) {
  return values.length;
}
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
