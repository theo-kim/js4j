#!/usr/bin/env node
'use strict';

/**
 * Example 04 — Callbacks (Java → JS)
 *
 * Demonstrates passing JavaScript objects to Java as interface implementations.
 * Java calls back into Node.js over a separate TCP connection handled by the
 * CallbackServer.
 *
 * Run:
 *   node examples/04-callbacks.js
 */

const { startTestGateway } = require('./_gateway');
const { createJavaProxy } = require('../src/callbackServer');
const { ClientServer } = require('../src/clientServer');
const { GatewayParameters, CallbackServerParameters } = require('../src/gateway');

async function main() {
  console.log('Connecting to Java gateway (with callback server)...\n');
  const { process: jvmProcess, kill: killProcess } = await startTestGateway();

  const cs = new ClientServer(
    new GatewayParameters({ port: 25333 }),
    new CallbackServerParameters({ port: 25334 })
  );
  await cs.connect();

  try {
    const jvm = cs.jvm;

    // -----------------------------------------------------------------------
    // Runnable — Java calls run() on the JS object
    // -----------------------------------------------------------------------
    console.log('--- Runnable callback ---');

    let runCount = 0;
    const runnable = createJavaProxy(['java.lang.Runnable'], {
      run() {
        runCount++;
        console.log(`  run() called! (invocation #${runCount})`);
        return null;
      },
    });

    const thread = await jvm.java.lang.Thread(runnable);
    await thread.start();
    await thread.join();

    console.log(`Runnable was invoked ${runCount} time(s)`);

    // -----------------------------------------------------------------------
    // Comparator — Java calls compare(a, b) to sort a list
    // -----------------------------------------------------------------------
    console.log('\n--- Comparator callback (sort by string length) ---');

    const byLength = createJavaProxy(['java.util.Comparator'], {
      compare(a, b) {
        return String(a).length - String(b).length;
      },
    });

    const words = await jvm.java.util.ArrayList();
    await words.add('banana'); await words.add('fig'); await words.add('apple');
    await words.add('kiwi');   await words.add('date');
    await jvm.java.util.Collections.sort(words, byLength);

    const sorted = await words.toArray();
    console.log('Sorted by length:', sorted);

    // -----------------------------------------------------------------------
    // Callable — returns a value back to Java
    // -----------------------------------------------------------------------
    console.log('\n--- Callable callback (returns a value) ---');

    const callable = createJavaProxy(['java.util.concurrent.Callable'], {
      call() {
        const value = 'computed by JavaScript at ' + new Date().toISOString();
        console.log('  call() invoked, returning:', value);
        return value;
      },
    });

    const future = await jvm.java.util.concurrent.FutureTask(callable);
    await future.run();
    const result = await future.get();
    console.log('FutureTask result:', result);

  } finally {
    await cs.shutdown();
    killProcess();
    console.log('\nGateway shut down.');
  }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
