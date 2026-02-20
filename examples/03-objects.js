#!/usr/bin/env node
'use strict';

/**
 * Example 03 — Java objects
 *
 * Shows how to work with Java objects returned from the gateway:
 *   - Calling methods on entry-point-created objects (Counter)
 *   - Creating Java standard-library objects from the JS side (StringBuilder)
 *   - Reading and writing fields via gateway.getField / gateway.setField
 *   - Introspection: getMethods, getFields, getStaticMembers, help
 *
 * Run:
 *   node examples/03-objects.js
 */

const { startTestGateway } = require('./_gateway');

async function main() {
  console.log('Connecting to Java gateway...\n');
  const { gateway, kill } = await startTestGateway();

  try {
    const ep  = gateway.entry_point;
    const jvm = gateway.jvm;

    // -----------------------------------------------------------------------
    // Objects returned by the entry point
    // -----------------------------------------------------------------------
    console.log('--- Counter object ---');
    const counter = await ep.createCounter(10);

    console.log('getValue()      =', await counter.getValue());  // 10
    await counter.increment();
    await counter.increment();
    console.log('after 2x increment:', await counter.getValue()); // 12
    await counter.add(8);
    console.log('after add(8)    =', await counter.getValue());  // 20
    await counter.decrement();
    console.log('after decrement =', await counter.getValue());  // 19
    await counter.reset();
    console.log('after reset     =', await counter.getValue());  // 0

    console.log('toString()      =', await counter.toString());  // Counter(0)

    // -----------------------------------------------------------------------
    // Creating Java objects from the JS side via gateway.jvm
    // -----------------------------------------------------------------------
    console.log('\n--- StringBuilder (created from JS) ---');
    const sb = await jvm.java.lang.StringBuilder('Hello');
    await sb.append(', ');
    await sb.append('World');
    await sb.append('!');
    console.log('toString()      =', await sb.toString());       // Hello, World!
    console.log('length()        =', await sb.length());         // 13

    // -----------------------------------------------------------------------
    // Static methods via the jvm namespace
    // -----------------------------------------------------------------------
    console.log('\n--- Static methods ---');
    const absVal = await jvm.java.lang.Math.abs(-42);
    console.log('Math.abs(-42)   =', absVal);                    // 42

    const maxVal = await jvm.java.lang.Math.max(17, 99);
    console.log('Math.max(17,99) =', maxVal);                    // 99

    const sqrtVal = await jvm.java.lang.Math.sqrt(12.25);
    console.log('Math.sqrt(12.25) =', sqrtVal);                  // 3.5

    const parsed  = await jvm.java.lang.Integer.parseInt('255');
    console.log('Integer.parseInt("255") =', parsed);            // 255

    // -----------------------------------------------------------------------
    // Static fields via gateway.getField
    // -----------------------------------------------------------------------
    console.log('\n--- Static fields ---');
    const pi      = await gateway.getField(jvm.java.lang.Math, 'PI');
    const maxInt  = await gateway.getField(jvm.java.lang.Integer, 'MAX_VALUE');
    console.log('Math.PI         =', pi);                        // 3.141592...
    console.log('Integer.MAX_VALUE =', maxInt);                  // 2147483647

    // -----------------------------------------------------------------------
    // Introspection
    // -----------------------------------------------------------------------
    console.log('\n--- Introspection ---');
    const methods = await gateway.getMethods(counter);
    console.log('Counter methods:', methods.sort().join(', '));

    const staticMembers = await gateway.getStaticMembers(jvm.java.lang.Math);
    const mathStatics = staticMembers.filter(m => ['abs', 'max', 'min', 'sqrt', 'PI', 'E'].includes(m));
    console.log('Math static members (subset):', mathStatics.sort().join(', '));

  } finally {
    await kill();
    console.log('\nGateway shut down.');
  }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
