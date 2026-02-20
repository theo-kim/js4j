# js4j

A Node.js implementation of [py4j](https://www.py4j.org/) — a bridge between JavaScript and Java using the py4j gateway protocol. js4j clients are wire-compatible with py4j's `GatewayServer`, so any existing Java side that works with py4j works with js4j too.

- Zero runtime dependencies
- Full TypeScript type definitions included
- Supports bidirectional communication (Java → JS callbacks)
- Mirrors the py4j API surface for easy migration

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
  - [JavaGateway](#javagateway)
  - [GatewayParameters](#gatewayparameters)
  - [CallbackServerParameters](#callbackserverparameters)
  - [ClientServer](#clientserver)
  - [JVMView](#jvmview)
  - [Java Object Types](#java-object-types)
    - [JavaObject](#javaobject)
    - [JavaClass](#javaclass)
    - [JavaPackage](#javapackage)
    - [JavaList](#javalist)
    - [JavaSet](#javaset)
    - [JavaMap](#javamap)
    - [JavaArray](#javaarray)
    - [JavaIterator](#javaiterator)
  - [Callbacks](#callbacks)
    - [createJavaProxy](#createjavaproxy)
    - [CallbackServer](#callbackserver)
    - [ProxyPool](#proxypool)
  - [Errors](#errors)
- [TypeScript](#typescript)

---

## Prerequisites

The Java side must be running a py4j `GatewayServer`. Add py4j to your Java project and start a server:

```java
import py4j.GatewayServer;

public class MyEntryPoint {
    public int add(int a, int b) { return a + b; }

    public static void main(String[] args) {
        GatewayServer server = new GatewayServer(new MyEntryPoint());
        server.start();
        System.out.println("Gateway server started on port 25333");
    }
}
```

The py4j JAR is available on [Maven Central](https://search.maven.org/artifact/net.sf.py4j/py4j) or bundled with a py4j Python installation at `$site-packages/py4j/java/py4j.jar`.

---

## Installation

```bash
npm install js4j
```

---

## Quick Start

```js
const { JavaGateway } = require('js4j');

async function main() {
  const gateway = new JavaGateway({ port: 25333 });
  await gateway.connect();

  // Call methods on the entry point object
  const result = await gateway.entry_point.add(3, 4); // 7

  // Traverse the JVM namespace to construct objects and call static methods
  const sb = await gateway.jvm.java.lang.StringBuilder('Hello');
  await sb.append(', World!');
  console.log(await sb.toString()); // "Hello, World!"

  const pi = await gateway.getField(gateway.jvm.java.lang.Math, 'PI'); // 3.14159…

  await gateway.close();
}

main();
```

---

## API Reference

### JavaGateway

The main entry point. Connects to a Java `GatewayServer` and provides access to the JVM.

```js
const { JavaGateway } = require('js4j');
const gateway = new JavaGateway(gatewayParameters?, callbackServerParameters?);
```

Both arguments accept either a parameter object instance or a plain options object (see [GatewayParameters](#gatewayparameters) and [CallbackServerParameters](#callbackserverparameters)).

#### Properties

| Property | Type | Description |
|---|---|---|
| `jvm` | `JVMView` | Root of the JVM namespace. Available after `connect()`. |
| `entry_point` | `JavaObject` | The entry point object registered with the `GatewayServer`. Available after `connect()`. |
| `connected` | `boolean` | Whether the gateway is currently connected. |
| `gatewayParameters` | `GatewayParameters` | The resolved connection parameters. |
| `callbackServerParameters` | `CallbackServerParameters` | The resolved callback server parameters. |

#### Methods

**`connect() → Promise<this>`**

Open the connection pool to the Java gateway. Must be called before any other operations.

```js
await gateway.connect();
```

**`close() → Promise<void>`**

Close all connections and stop the callback server (if running). Does not shut down the Java GatewayServer.

**`shutdown() → Promise<void>`**

Send a shutdown command to the Java GatewayServer, then close all connections.

**`startCallbackServer() → Promise<CallbackServer>`**

Start a TCP server that accepts Java → JS callback connections. Required if you pass JS proxy objects to Java.

```js
await gateway.startCallbackServer();
```

**`shutdownCallbackServer() → Promise<void>`**

Stop the callback server.

**`getField(target, fieldName) → Promise<any>`**

Read a field on a Java object or class (including static fields).

```js
const pi = await gateway.getField(gateway.jvm.java.lang.Math, 'PI');
const name = await gateway.getField(myObj, 'name');
```

**`setField(target, fieldName, value) → Promise<void>`**

Write a field on a Java object.

```js
await gateway.setField(myObj, 'value', 42);
```

**`newArray(javaClass, ...dimensions) → Promise<JavaArray>`**

Create a new Java array of the given type and dimensions.

```js
const arr = await gateway.newArray(gateway.jvm.java.lang.Integer, 5);
await arr.set(0, 100);
```

Multi-dimensional arrays use multiple dimension arguments:

```js
const matrix = await gateway.newArray(gateway.jvm.java.lang.Double, 3, 3);
```

**`javaImport(classFqn) → Promise<void>`**

Import a Java class into the `jvm` namespace so it can be accessed by simple name.

```js
await gateway.javaImport('java.util.ArrayList');
const list = await gateway.jvm.ArrayList();
```

**`newJvmView(name?) → Promise<JVMView>`**

Create an additional JVMView with its own import namespace.

**`getMethods(javaObject) → Promise<string[]>`**

List the public methods of a Java object.

**`getFields(javaObject) → Promise<string[]>`**

List the public fields of a Java object.

**`getStaticMembers(javaClass) → Promise<string[]>`**

List the public static members of a Java class.

**`help(target) → Promise<string>`**

Get documentation for a Java object, class, or class FQN string.

**`releaseObject(javaObject) → Promise<void>`**
**`detach(javaObject) → Promise<void>`**

Notify the JVM that a Java object reference is no longer needed (allows garbage collection). Both names are equivalent.

---

### GatewayParameters

Configuration for connecting to the Java GatewayServer.

```js
const { GatewayParameters } = require('js4j');
const params = new GatewayParameters(options?);
```

| Option | Type | Default | Description |
|---|---|---|---|
| `host` | `string` | `'127.0.0.1'` | Hostname of the GatewayServer. |
| `port` | `number` | `25333` | Port of the GatewayServer. |
| `authToken` | `string \| null` | `null` | Authentication token (if the server requires one). |
| `autoField` | `boolean` | `false` | Automatically read fields on property access (not yet implemented). |
| `autoConvert` | `boolean` | `false` | Automatically convert Java collections to JS types (not yet implemented). |
| `enableMemoryManagement` | `boolean` | `false` | Auto-release Java objects when they are garbage collected. |
| `poolSize` | `number` | `4` | Number of TCP connections to maintain in the connection pool. |

A plain object can be passed anywhere `GatewayParameters` is expected:

```js
const gateway = new JavaGateway({ host: 'localhost', port: 25333 });
```

---

### CallbackServerParameters

Configuration for the callback server (JS-side TCP server that accepts Java → JS calls).

```js
const { CallbackServerParameters } = require('js4j');
const params = new CallbackServerParameters(options?);
```

| Option | Type | Default | Description |
|---|---|---|---|
| `host` | `string` | `'127.0.0.1'` | Address to bind the callback server on. |
| `port` | `number` | `25334` | Port to listen on. |
| `daemonize` | `boolean` | `true` | Allow Node.js to exit even if the server is still listening. |
| `propagateException` | `boolean` | `false` | Re-throw exceptions from callback methods. |

---

### ClientServer

A convenience wrapper that combines `JavaGateway` and `CallbackServer` and starts both automatically. Mirrors py4j's `ClientServer`.

```js
const { ClientServer } = require('js4j');

const cs = new ClientServer(
  { port: 25333 },   // gateway parameters
  { port: 25334 }    // callback server parameters
);
await cs.connect();
```

`ClientServer` exposes the same convenience methods as `JavaGateway` and additionally starts the callback server during `connect()`.

#### Properties

| Property | Type | Description |
|---|---|---|
| `jvm` | `JVMView` | Delegated from the underlying gateway. |
| `entry_point` | `JavaObject` | Delegated from the underlying gateway. |
| `gateway` | `JavaGateway` | The underlying gateway instance. |
| `callbackServer` | `CallbackServer \| null` | The callback server instance, once started. |

#### Methods

`connect()`, `shutdown()`, `getField()`, `setField()`, `newArray()`, `newJvmView()`, `getMethods()`, `getFields()`, `getStaticMembers()`, `javaImport()`, `help()`, `releaseObject()`, `detach()` — all delegate to the underlying `JavaGateway`.

---

### JVMView

The root of the `gateway.jvm` namespace. Accessed as `gateway.jvm` after `connect()`.

#### Traversal

Property access on a `JVMView` returns `JavaPackage` or `JavaClass` objects by following the Java package hierarchy. A segment starting with an uppercase letter is treated as a class name.

```js
const jvm = gateway.jvm;

// Package traversal
const pkg = jvm.java.util;          // JavaPackage for java.util
const cls = jvm.java.util.ArrayList; // JavaClass for java.util.ArrayList

// Constructor call — returns Promise<JavaObject>
const list = await jvm.java.util.ArrayList();

// Static method call
const abs = await jvm.java.lang.Math.abs(-42); // 42
```

#### Methods

**`javaImport(fqn) → Promise<void>`**

Register a class FQN as a shortcut so it can be accessed by simple name on this view.

```js
await gateway.jvm.javaImport('java.util.LinkedList');
const ll = await gateway.jvm.LinkedList(); // works now
```

**`removeImport(fqn) → Promise<void>`**

Remove a previously registered shortcut.

**`getClass(classFqn) → JavaClass`**

Get a `JavaClass` directly by FQN without traversal.

```js
const ArrayList = jvm.getClass('java.util.ArrayList');
```

**`help(classFqn) → Promise<string>`**

Get documentation for a Java class by FQN.

---

### Java Object Types

#### JavaObject

A reference to a Java object instance. Property access returns async functions that invoke Java methods.

```js
const sb = await gateway.jvm.java.lang.StringBuilder('Hello');
await sb.append(' World');            // calls StringBuilder.append
const s = await sb.toString();        // 'Hello World'
const len = await sb.length();        // 11
```

The object has two reserved properties used internally:

| Property | Type | Description |
|---|---|---|
| `_targetId` | `string` | Internal object ID used in the py4j protocol. |
| `_gatewayClient` | `GatewayClient` | The client that owns this reference. |

Any other property access returns a function that invokes the corresponding Java method.

#### JavaClass

A reference to a Java class, used for constructors and static members. Obtained by traversing `gateway.jvm`.

```js
const Math = gateway.jvm.java.lang.Math;

// Static method call
const abs = await Math.abs(-5);       // 5

// Constructor call (same as await jvm.java.lang.String('hello'))
const str = await gateway.jvm.java.lang.String('hello');

// Static field access
const pi = await gateway.getField(Math, 'PI');
```

| Property | Type | Description |
|---|---|---|
| `_fqn` | `string` | Fully-qualified class name. |
| `_targetId` | `string` | Protocol target ID (`z:<fqn>` for static dispatch). |
| `_isJavaClass` | `true` | Marker property. |

#### JavaPackage

An intermediate namespace object returned during package traversal. Not directly callable.

| Property | Type | Description |
|---|---|---|
| `_fqn` | `string` | The partial package name accumulated so far. |
| `_isJavaPackage` | `true` | Marker property. |

#### JavaList

Returned automatically when a Java method returns a `java.util.List`. Wraps standard `List` methods and adds JS conveniences.

```js
const list = await gateway.entry_point.getList(); // JavaList

await list.size();                        // number
await list.get(0);                        // element at index
await list.add('item');                   // append
await list.addAt(1, 'item');              // insert at index
await list.set(0, 'replaced');            // replace element
await list.remove(0);                     // remove by index (or by value if non-integer)
await list.contains('item');              // boolean
await list.indexOf('item');               // number
await list.subList(1, 3);                 // JavaList slice
await list.sort();                        // in-place sort (natural ordering)
await list.reverse();                     // in-place reverse
await list.count('item');                 // occurrences of value
await list.toArray();                     // Promise<any[]>  — all elements as a JS array

// Async iteration
for await (const item of list) {
  console.log(item);
}

// Access any other List method not listed above
await list.isEmpty();
await list.lastIndexOf('item');
```

#### JavaSet

Returned automatically when a Java method returns a `java.util.Set`.

```js
const set = await gateway.entry_point.getSet(); // JavaSet

await set.size();
await set.add('item');
await set.remove('item');
await set.contains('item');
await set.clear();
await set.toArray();                // Promise<any[]>
await set.toSet();                  // Promise<Set<any>>  — native JS Set

for await (const item of set) { … }
```

#### JavaMap

Returned automatically when a Java method returns a `java.util.Map`.

```js
const map = await gateway.entry_point.getMap(); // JavaMap

await map.size();
await map.get('key');
await map.put('key', 'value');
await map.remove('key');
await map.containsKey('key');
await map.containsValue('value');
await map.clear();
await map.keySet();                 // JavaSet of keys
await map.values();                 // JavaObject (Collection)
await map.entrySet();               // JavaSet of Map.Entry objects
await map.toMap();                  // Promise<Map<any,any>>  — native JS Map
await map.toObject();               // Promise<Record<string,any>>  — plain JS object
```

#### JavaArray

Returned automatically when a Java method returns a Java array, or created via `gateway.newArray()`.

```js
const arr = await gateway.newArray(gateway.jvm.java.lang.Integer, 3);

await arr.length();                 // 3
await arr.get(0);                   // element at index
await arr.set(0, 42);               // set element
await arr.slice(1, 3);              // JavaArray (sub-array)
await arr.toArray();                // Promise<any[]>

for await (const item of arr) { … }
```

#### JavaIterator

Returned automatically when a Java method returns a `java.util.Iterator`.

```js
const iter = await someJavaObject.iterator();

await iter.hasNext();               // boolean
await iter.next();                  // next element
await iter.remove();                // remove last returned element
await iter.toArray();               // Promise<any[]>

for await (const item of iter) { … }
```

---

### Callbacks

Callbacks allow Java code to call back into JavaScript. This requires a `CallbackServer` to be running and JS objects to be registered with a `ProxyPool`.

#### createJavaProxy

Wrap a plain JS object so that it can be passed to Java as an implementation of one or more Java interfaces.

```js
const { createJavaProxy } = require('js4j');

const proxy = createJavaProxy(interfaces, impl);
```

| Parameter | Type | Description |
|---|---|---|
| `interfaces` | `string[]` | Fully-qualified names of the Java interfaces this object implements. |
| `impl` | `object` | An object whose methods will be called by Java. |

The returned object has two additional properties: `_js4jProxy: true` and `_interfaces: string[]`.

```js
// Implement java.lang.Runnable
const runnable = createJavaProxy(['java.lang.Runnable'], {
  run() {
    console.log('Java called run!');
    return null;
  },
});

const thread = await gateway.jvm.java.lang.Thread(runnable);
await thread.start();
await thread.join();
```

```js
// Implement java.util.Comparator
const byLength = createJavaProxy(['java.util.Comparator'], {
  compare(a, b) {
    return String(a).length - String(b).length;
  },
});

const list = await gateway.jvm.java.util.ArrayList();
await list.add('banana'); await list.add('fig'); await list.add('apple');
await gateway.jvm.java.util.Collections.sort(list, byLength);
```

```js
// Implement java.util.concurrent.Callable (returns a value)
const callable = createJavaProxy(['java.util.concurrent.Callable'], {
  call() {
    return 'hello from JS';
  },
});

const future = await gateway.jvm.java.util.concurrent.FutureTask(callable);
await future.run();
const result = await future.get(); // 'hello from JS'
```

> **Note:** Callback proxies require a `CallbackServer` to be running. Use `ClientServer` (which starts one automatically) or call `gateway.startCallbackServer()` before passing proxies to Java.

#### CallbackServer

Manages the TCP server that accepts incoming Java → JS calls.

```js
const { CallbackServer } = require('js4j');

const server = new CallbackServer({
  host: '127.0.0.1',
  port: 25334,
  proxyPool,        // ProxyPool instance
  gatewayClient,    // GatewayClient instance (for decoding Java object args)
});

await server.start();
// …
await server.stop();
```

| Property | Type | Description |
|---|---|---|
| `host` | `string` | Bound address. |
| `port` | `number` | Listening port (updated to actual port after `start()` if `port: 0` was given). |
| `listening` | `boolean` | Whether the server is currently listening. |
| `proxyPool` | `ProxyPool` | The pool of registered JS proxy objects. |

#### ProxyPool

Maintains a registry of JS objects that Java can invoke callbacks on.

```js
const { ProxyPool } = require('js4j');
const pool = new ProxyPool();

const id = pool.register(myObj);   // returns an id string
pool.get(id);                      // returns the object or null
pool.has(id);                      // boolean
pool.remove(id);                   // deregisters the object
```

You do not normally need to interact with `ProxyPool` directly — it is managed internally by `JavaGateway` and `CallbackServer`.

---

### Errors

All errors extend `Js4JError`.

| Class | Description |
|---|---|
| `Js4JError` | Base error class for all js4j errors. |
| `Js4JJavaError` | A Java-side exception occurred. Contains `javaExceptionMessage` (raw protocol payload) and `javaException` (a `JavaObject` wrapping the `Throwable`). |
| `Js4JNetworkError` | A network or connection error occurred. |
| `Js4JAuthenticationError` | Authentication with the GatewayServer failed. |

```js
const { Js4JJavaError, Js4JNetworkError } = require('js4j');

try {
  await gateway.entry_point.riskyMethod();
} catch (err) {
  if (err instanceof Js4JJavaError) {
    console.error('Java threw:', err.message);
    // Optionally inspect the Java Throwable
    if (err.javaException) {
      const msg = await err.javaException.getMessage();
      console.error('Java message:', msg);
    }
  } else if (err instanceof Js4JNetworkError) {
    console.error('Connection problem:', err.message);
  } else {
    throw err;
  }
}
```

---

## TypeScript

Full type definitions are included. No `@types/` package is needed.

```ts
import {
  JavaGateway,
  ClientServer,
  GatewayParameters,
  CallbackServerParameters,
  JavaObject,
  JavaList,
  JavaMap,
  createJavaProxy,
  Js4JJavaError,
} from 'js4j';

const gateway = new JavaGateway({ port: 25333 });
await gateway.connect();

const list: JavaList = await gateway.entry_point.getList();
const items: any[] = await list.toArray();
```

---

## Running Tests

```bash
npm test              # unit + integration tests (requires Java gateway)
npm run test:unit     # unit tests only (no Java required)
```
