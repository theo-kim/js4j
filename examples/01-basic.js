#!/usr/bin/env node
'use strict';

/**
 * Example 01 — Basic usage
 *
 * Shows how to connect to a Java gateway, call methods on the entry point
 * object, and work with primitive types (numbers, strings, booleans, null).
 *
 * Run:
 *   node examples/01-basic.js
 */

const { startTestGateway } = require('./_gateway');

async function main() {
  console.log('Connecting to Java gateway...\n');
  const { gateway, kill } = await startTestGateway();

  try {
    const ep = gateway.entry_point;

    // -----------------------------------------------------------------------
    // Arithmetic
    // -----------------------------------------------------------------------
    console.log('--- Arithmetic ---');
    console.log('add(3, 4)        =', await ep.add(3, 4));           // 7
    console.log('multiply(6, 7)   =', await ep.multiply(6, 7));      // 42
    console.log('divide(5.5, 2.2) =', await ep.divide(5.5, 2.2));    // 2.5
    console.log('addDoubles(1.1, 2.2) =', await ep.addDoubles(1.1, 2.2)); // 3.3
    console.log('addLongs(2^32, 1) =', await ep.addLongs(4294967296, 1)); // 4294967297

    // -----------------------------------------------------------------------
    // Strings
    // -----------------------------------------------------------------------
    console.log('\n--- Strings ---');
    console.log(await ep.greet('World'));                          // Hello, World!
    console.log(await ep.concatenate('foo', 'bar'));               // foobar
    console.log('length("hello") =', await ep.stringLength('hello'));  // 5
    console.log(await ep.toUpperCase('js4j'));                    // JS4J
    console.log('containsSubstring =', await ep.containsSubstring('hello world', 'world')); // true
    console.log(await ep.repeatString('ab', 3));                  // ababab

    // -----------------------------------------------------------------------
    // Booleans
    // -----------------------------------------------------------------------
    console.log('\n--- Booleans ---');
    console.log('true && false =', await ep.andBool(true, false));  // false
    console.log('true || false =', await ep.orBool(true, false));   // true
    console.log('!true         =', await ep.notBool(true));         // false

    // -----------------------------------------------------------------------
    // Null handling
    // -----------------------------------------------------------------------
    console.log('\n--- Null ---');
    console.log('maybeNull(false) =', await ep.maybeNull(false));  // "not null"
    console.log('maybeNull(true)  =', await ep.maybeNull(true));   // null
    console.log('isNull(null)     =', await ep.isNull(null));      // true

    // -----------------------------------------------------------------------
    // Type round-trips
    // -----------------------------------------------------------------------
    console.log('\n--- Type round-trips ---');
    console.log('echoInt(42)      =', await ep.echoInt(42));
    console.log('echoDouble(3.14) =', await ep.echoDouble(3.14));
    console.log('echoBool(true)   =', await ep.echoBool(true));
    console.log('echoString("hi") =', await ep.echoString('hi'));

  } finally {
    await kill();
    console.log('\nGateway shut down.');
  }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
