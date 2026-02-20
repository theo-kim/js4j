'use strict';

/**
 * Comparison tests using js4j (Node.js implementation).
 *
 * Runs the exact same operations as test_py4j.py and writes results to
 * comparison_results_js4j.json for comparison.
 *
 * Usage:
 *   node test_js4j.js [--gateway-port 25333] [--output results_js4j.json]
 */

const fs = require('fs');
const path = require('path');

const { JavaGateway, GatewayParameters, Js4JJavaError } = require('../../index');

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
let gatewayPort = 25333;
let outputFile = 'comparison_results_js4j.json';

for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--gateway-port' && argv[i + 1]) {
    gatewayPort = parseInt(argv[++i], 10);
  } else if (argv[i] === '--output' && argv[i + 1]) {
    outputFile = argv[++i];
  }
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------
const results = {};

async function runTest(name, fn) {
  try {
    const value = await fn();
    results[name] = { status: 'ok', value: serialise(value) };
    console.log(`  PASS  ${name} => ${JSON.stringify(results[name].value)}`);
  } catch (err) {
    if (err && (err.name === 'Js4JJavaError' || err.constructor.name === 'Js4JJavaError')) {
      results[name] = { status: 'java_error', value: err.javaExceptionMessage || err.message };
      console.log(`  JAVA_ERR  ${name}: ${err.message}`);
    } else {
      results[name] = { status: 'error', value: err.message || String(err) };
      console.log(`  ERROR  ${name}: ${err.message}`);
    }
  }
}

function serialise(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return v;
  // Java objects — return their string representation
  return String(v);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const gateway = new JavaGateway(new GatewayParameters({ port: gatewayPort }));
  await gateway.connect();
  const ep = gateway.entry_point;
  const jvm = gateway.jvm;

  console.log('\n--- Arithmetic ---');
  await runTest('add_int',       () => ep.add(3, 4));
  await runTest('add_negative',  () => ep.add(-10, 5));
  await runTest('add_doubles',   () => ep.addDoubles(1.5, 2.5));
  await runTest('multiply',      () => ep.multiply(6, 7));
  await runTest('divide',        () => ep.divide(10.0, 4.0));

  console.log('\n--- Strings ---');
  await runTest('greet',             () => ep.greet('World'));
  await runTest('concatenate',       () => ep.concatenate('foo', 'bar'));
  await runTest('string_length',     () => ep.stringLength('hello'));
  await runTest('to_upper_case',     () => ep.toUpperCase('hello'));
  await runTest('contains_true',     () => ep.containsSubstring('foobar', 'oba'));
  await runTest('contains_false',    () => ep.containsSubstring('foobar', 'xyz'));
  await runTest('repeat_string',     () => ep.repeatString('ab', 3));

  console.log('\n--- Booleans ---');
  await runTest('and_true',  () => ep.andBool(true, true));
  await runTest('and_false', () => ep.andBool(true, false));
  await runTest('or_true',   () => ep.orBool(false, true));
  await runTest('or_false',  () => ep.orBool(false, false));
  await runTest('not_true',  () => ep.notBool(true));
  await runTest('not_false', () => ep.notBool(false));

  console.log('\n--- Null handling ---');
  await runTest('maybe_null_returns_null', () => ep.maybeNull(true));
  await runTest('maybe_null_returns_str',  () => ep.maybeNull(false));

  console.log('\n--- Collections ---');
  await runTest('list_size',  async () => { const l = await ep.getStringList(); return l.size(); });
  await runTest('list_get_0', async () => { const l = await ep.getStringList(); return l.get(0); });
  await runTest('list_get_2', async () => { const l = await ep.getStringList(); return l.get(2); });

  await runTest('int_list_get_0', async () => { const l = await ep.getIntList(); return l.get(0); });
  await runTest('int_list_get_4', async () => { const l = await ep.getIntList(); return l.get(4); });
  await runTest('int_list_size',  async () => { const l = await ep.getIntList(); return l.size(); });

  await runTest('set_size',         async () => { const s = await ep.getStringSet(); return s.size(); });
  await runTest('set_contains_one', async () => { const s = await ep.getStringSet(); return s.contains('one'); });
  await runTest('set_contains_xxx', async () => { const s = await ep.getStringSet(); return s.contains('xxx'); });

  await runTest('map_size',           async () => { const m = await ep.getStringIntMap(); return m.size(); });
  await runTest('map_get_a',          async () => { const m = await ep.getStringIntMap(); return m.get('a'); });
  await runTest('map_get_c',          async () => { const m = await ep.getStringIntMap(); return m.get('c'); });
  await runTest('map_contains_key_a', async () => { const m = await ep.getStringIntMap(); return m.containsKey('a'); });
  await runTest('map_contains_key_z', async () => { const m = await ep.getStringIntMap(); return m.containsKey('z'); });

  console.log('\n--- Type round-trips ---');
  await runTest('echo_int_pos',    () => ep.echoInt(42));
  await runTest('echo_int_neg',    () => ep.echoInt(-99));
  await runTest('echo_long',       () => ep.echoLong(1000000000000));
  await runTest('echo_double',     () => ep.echoDouble(3.14));
  await runTest('echo_bool_true',  () => ep.echoBool(true));
  await runTest('echo_bool_false', () => ep.echoBool(false));
  await runTest('echo_string',     () => ep.echoString('js4j'));

  console.log('\n--- Counter object ---');
  await runTest('counter_initial', async () => {
    const c = await ep.createCounter(10);
    return c.getValue();
  });
  await runTest('counter_increment', async () => {
    const c = await ep.createCounter(5);
    await c.increment();
    return c.getValue();
  });
  await runTest('counter_add', async () => {
    const c = await ep.createCounter(3);
    await c.add(7);
    return c.getValue();
  });

  console.log('\n--- Exceptions ---');
  await runTest('throw_exception', () => ep.throwException('boom'));
  await runTest('divide_by_zero',  () => ep.divideInts(10, 0));

  console.log('\n--- JVM namespace ---');
  await runTest('Math_abs',           () => jvm.java.lang.Math.abs(-42));
  await runTest('Math_max',           () => jvm.java.lang.Math.max(3, 7));
  await runTest('Math_min',           () => jvm.java.lang.Math.min(3, 7));
  await runTest('Math_PI',            () => gateway.getField(jvm.java.lang.Math, 'PI'));
  await runTest('Integer_MAX',        () => gateway.getField(jvm.java.lang.Integer, 'MAX_VALUE'));
  await runTest('String_valueOf_int', () => jvm.java.lang.String.valueOf(123));

  console.log('\n--- StringBuilder (constructor via JVM) ---');
  await runTest('stringbuilder_basic', async () => {
    const sb = await jvm.java.lang.StringBuilder('Hello');
    await sb.append(' World');
    return sb.toString();
  });

  console.log('\n--- ArrayList (constructor via JVM) ---');
  await runTest('arraylist_add_size', async () => {
    const lst = await jvm.java.util.ArrayList();
    await lst.add('x');
    await lst.add('y');
    return lst.size();
  });

  await gateway.close();

  // Write results
  const out = JSON.stringify(results, null, 2);
  fs.writeFileSync(outputFile, out);
  console.log(`\nResults written to ${outputFile}`);

  const passed = Object.values(results).filter(r => r.status === 'ok').length;
  const total = Object.keys(results).length;
  console.log(`${passed}/${total} tests produced a result`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
