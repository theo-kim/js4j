#!/usr/bin/env node
'use strict';

/**
 * Example 02 — Java collections
 *
 * Demonstrates JavaList, JavaSet, JavaMap, and JavaArray — the wrappers
 * js4j creates automatically when Java methods return collection types.
 *
 * Run:
 *   node examples/02-collections.js
 */

const { startTestGateway } = require('./_gateway');

async function main() {
  console.log('Connecting to Java gateway...\n');
  const { gateway, kill } = await startTestGateway();

  try {
    const ep = gateway.entry_point;

    // -----------------------------------------------------------------------
    // JavaList
    // -----------------------------------------------------------------------
    console.log('--- JavaList ---');
    const list = await ep.getStringList();   // returns ArrayList<String>

    console.log('size()          =', await list.size());           // 3
    console.log('get(0)          =', await list.get(0));           // alpha
    console.log('get(2)          =', await list.get(2));           // gamma
    console.log('contains("beta")=', await list.contains('beta')); // true
    console.log('indexOf("gamma")=', await list.indexOf('gamma')); // 2

    // Mutation
    await list.add('delta');
    console.log('after add("delta"), size =', await list.size());  // 4

    // Convert to a plain JS array
    const arr = await list.toArray();
    console.log('toArray()       =', arr);                         // ['alpha','beta','gamma','delta']

    // Iteration with for-await
    process.stdout.write('for-await: ');
    for await (const item of list) process.stdout.write(item + ' ');
    console.log();

    // -----------------------------------------------------------------------
    // JavaSet
    // -----------------------------------------------------------------------
    console.log('\n--- JavaSet ---');
    const set = await ep.getStringSet();     // returns LinkedHashSet<String>

    console.log('size()          =', await set.size());             // 3
    console.log('contains("one") =', await set.contains('one'));    // true
    console.log('contains("four")=', await set.contains('four'));   // false

    await set.add('four');
    console.log('after add("four"), size =', await set.size());     // 4

    const nativeSet = await set.toSet();     // JS Set
    console.log('toSet()         =', nativeSet);

    // -----------------------------------------------------------------------
    // JavaMap
    // -----------------------------------------------------------------------
    console.log('\n--- JavaMap ---');
    const map = await ep.getStringIntMap();  // returns LinkedHashMap<String,Integer>

    console.log('size()          =', await map.size());             // 3
    console.log('get("a")        =', await map.get('a'));           // 1
    console.log('get("z")        =', await map.get('z'));           // null
    console.log('containsKey("b")=', await map.containsKey('b'));   // true

    await map.put('d', 4);
    console.log('after put("d",4), size =', await map.size());      // 4

    // Convert to a plain JS object
    const obj = await map.toObject();
    console.log('toObject()      =', obj);                          // { a:1, b:2, c:3, d:4 }

    // -----------------------------------------------------------------------
    // JavaArray
    // -----------------------------------------------------------------------
    console.log('\n--- JavaArray ---');
    const intArr = await ep.getIntArray();  // int[]{10,20,30,40,50}

    console.log('length()        =', await intArr.length());         // 5
    console.log('get(0)          =', await intArr.get(0));           // 10
    console.log('get(4)          =', await intArr.get(4));           // 50

    // Convert all elements to a JS array
    console.log('toArray()       =', await intArr.toArray());        // [10,20,30,40,50]

    // Create a new Java array from the JS side
    const newArr = await gateway.newArray(gateway.jvm.java.lang.Integer, 3);
    await newArr.set(0, 100);
    await newArr.set(1, 200);
    await newArr.set(2, 300);
    console.log('newArray result =', await newArr.toArray());        // [100,200,300]

  } finally {
    await kill();
    console.log('\nGateway shut down.');
  }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
