#!/usr/bin/env node
'use strict';

/**
 * Example 05 — Java standard library
 *
 * Demonstrates direct access to Java standard-library classes via the
 * gateway.jvm namespace — no custom Java code required.
 *
 * Topics covered:
 *   - java.lang  (String, Math, System, Integer, StringBuilder)
 *   - java.util  (ArrayList, HashMap, TreeMap, Collections, UUID, Date)
 *   - java.time  (LocalDate, LocalDateTime, Duration) [Java 8+]
 *   - javaImport shortcut
 *
 * Run:
 *   node examples/05-stdlib.js
 */

const { startTestGateway } = require('./_gateway');

async function main() {
  console.log('Connecting to Java gateway...\n');
  const { gateway, kill } = await startTestGateway();

  try {
    const jvm = gateway.jvm;

    // -----------------------------------------------------------------------
    // java.lang
    // -----------------------------------------------------------------------
    console.log('--- java.lang ---');

    const sb = await jvm.java.lang.StringBuilder();
    await sb.append('js4j');
    await sb.append(' + ');
    await sb.append('Java');
    console.log('StringBuilder:', await sb.toString());

    const strVal = await jvm.java.lang.String.valueOf(42);
    console.log('String.valueOf(42): ', strVal);

    console.log('Math.PI:  ', await gateway.getField(jvm.java.lang.Math, 'PI'));
    console.log('Math.exp(1.5):', await jvm.java.lang.Math.exp(1.5));
    console.log('Math.floor(3.9):', await jvm.java.lang.Math.floor(3.9));
    console.log('Math.log(Math.E):', await jvm.java.lang.Math.log(
      await gateway.getField(jvm.java.lang.Math, 'E')
    ));

    const ms = await jvm.java.lang.System.currentTimeMillis();
    console.log('System.currentTimeMillis:', ms);

    console.log('Integer.MAX_VALUE:', await gateway.getField(jvm.java.lang.Integer, 'MAX_VALUE'));
    console.log('Integer.toBinaryString(255):', await jvm.java.lang.Integer.toBinaryString(255));
    console.log('Integer.toHexString(255):', await jvm.java.lang.Integer.toHexString(255));

    // -----------------------------------------------------------------------
    // java.util
    // -----------------------------------------------------------------------
    console.log('\n--- java.util ---');

    const list = await jvm.java.util.ArrayList();
    await list.add('cherry');
    await list.add('apple');
    await list.add('banana');
    await jvm.java.util.Collections.sort(list);
    console.log('Sorted ArrayList:', await list.toArray());

    const map = await jvm.java.util.HashMap();
    await map.put('x', 10);
    await map.put('y', 20);
    await map.put('z', 30);
    console.log('HashMap size:  ', await map.size());
    console.log('HashMap get x: ', await map.get('x'));

    const tree = await jvm.java.util.TreeMap(map);
    const keys = await tree.keySet();
    console.log('TreeMap keys:  ', await keys.toArray());

    const uuid = await jvm.java.util.UUID.randomUUID();
    const uuidStr = await uuid.toString();
    console.log('UUID:          ', uuidStr);
    console.log('UUID version:  ', await uuid.version());

    const nums = await jvm.java.util.ArrayList();
    await nums.add(5); await nums.add(3); await nums.add(9); await nums.add(1); await nums.add(7);
    console.log('max of [5,3,9,1,7]:', await jvm.java.util.Collections.max(nums));
    console.log('min of [5,3,9,1,7]:', await jvm.java.util.Collections.min(nums));

    // -----------------------------------------------------------------------
    // java.time  (Java 8+)
    // -----------------------------------------------------------------------
    console.log('\n--- java.time ---');

    const today = await jvm.java.time.LocalDate.now();
    console.log('LocalDate.now():', await today.toString());

    const fixed = await jvm.java.time.LocalDate.of(2000, 1, 1);
    console.log('Year 2000:      ', await fixed.toString());

    const duration = await jvm.java.time.Duration.ofHours(3);
    console.log('Duration (3h):  ', await duration.toString());
    console.log('In minutes:     ', await duration.toMinutes());

    // -----------------------------------------------------------------------
    // javaImport — shortcut access
    // -----------------------------------------------------------------------
    console.log('\n--- javaImport shortcut ---');

    await gateway.javaImport('java.util.LinkedList');
    const linked = await jvm.LinkedList();
    await linked.add('first');
    await linked.add('second');
    await linked.addFirst('zeroth');
    console.log('LinkedList:', await linked.toArray());

  } finally {
    await kill();
    console.log('\nGateway shut down.');
  }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
