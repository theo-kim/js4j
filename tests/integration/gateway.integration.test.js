'use strict';

/**
 * Integration tests — require a live Java GatewayServer.
 *
 * These tests start the Java TestEntryPoint server as a child process,
 * run the full js4j client against it, and verify correct behaviour.
 *
 * To run:
 *   PY4J_JAR=/path/to/py4j.jar npm run test:integration
 *
 * Or if py4j is installed via pip, the JAR path is auto-detected.
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

const { JavaGateway, GatewayParameters, Js4JJavaError } = require('../../index');

// ---------------------------------------------------------------------------
// Locate py4j JAR
// ---------------------------------------------------------------------------

function findPy4jJar() {
  if (process.env.PY4J_JAR) return process.env.PY4J_JAR;
  try {
    const site = execSync(
      'python3 -c "import py4j, os; print(os.path.dirname(py4j.__file__))"',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    const libDir = path.join(site, 'java', 'lib');
    if (fs.existsSync(libDir)) {
      const jars = fs.readdirSync(libDir).filter(f => f.endsWith('.jar'));
      if (jars.length > 0) return path.join(libDir, jars[0]);
    }
  } catch (_) {}
  return null;
}

const PY4J_JAR = findPy4jJar();
const ROOT = path.resolve(__dirname, '../..');
const BUILD_DIR = path.join(ROOT, 'java', 'build');
const JAVA_SRC = path.join(ROOT, 'java', 'TestEntryPoint.java');

const SKIP = !PY4J_JAR;

// ---------------------------------------------------------------------------
// Gateway server lifecycle
// ---------------------------------------------------------------------------

let gatewayProcess = null;
let gateway = null;
let gatewayPort = 25433; // use non-default port to avoid conflicts

function waitForPort(port, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function attempt() {
      const s = new net.Socket();
      s.setTimeout(500);
      s.on('connect', () => { s.destroy(); resolve(); });
      s.on('error', () => {
        s.destroy();
        if (Date.now() - start > timeout) return reject(new Error(`Port ${port} not ready`));
        setTimeout(attempt, 200);
      });
      s.on('timeout', () => { s.destroy(); setTimeout(attempt, 200); });
      s.connect(port, '127.0.0.1');
    }
    attempt();
  });
}

beforeAll(async () => {
  if (SKIP) return;

  // Compile Java
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  execSync(`javac -cp "${PY4J_JAR}" -d "${BUILD_DIR}" "${JAVA_SRC}"`, { stdio: 'pipe' });

  // Start gateway
  await new Promise((resolve, reject) => {
    gatewayProcess = spawn('java', [
      '-cp', `${BUILD_DIR}:${PY4J_JAR}`,
      'TestEntryPoint',
      String(gatewayPort),
    ], { stdio: ['pipe', 'pipe', 'inherit'] });

    let buf = '';
    gatewayProcess.stdout.setEncoding('utf8');
    gatewayProcess.stdout.on('data', (chunk) => {
      buf += chunk;
      if (buf.includes('GATEWAY_STARTED:')) resolve();
    });
    gatewayProcess.on('error', reject);
    setTimeout(() => reject(new Error('Gateway startup timeout')), 15000);
  });

  await waitForPort(gatewayPort);

  gateway = new JavaGateway(new GatewayParameters({ port: gatewayPort }));
  await gateway.connect();
}, 30000);

afterAll(async () => {
  if (gateway) await gateway.close();
  if (gatewayProcess) {
    gatewayProcess.stdin.end();
    gatewayProcess.kill('SIGTERM');
  }
});

// ---------------------------------------------------------------------------
// Conditionally skip if no Java/py4j available
// ---------------------------------------------------------------------------

const it2 = SKIP ? it.skip : it;
if (SKIP) {
  console.warn(
    '\n[SKIP] Integration tests require py4j JAR. ' +
    'Install py4j (pip install py4j) or set PY4J_JAR=/path/to/py4j.jar\n'
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Integration: arithmetic', () => {
  it2('add two integers', async () => {
    const result = await gateway.entry_point.add(3, 4);
    expect(result).toBe(7);
  });

  it2('add negative integers', async () => {
    expect(await gateway.entry_point.add(-10, 5)).toBe(-5);
  });

  it2('add doubles', async () => {
    expect(await gateway.entry_point.addDoubles(1.5, 2.5)).toBeCloseTo(4.0);
  });

  it2('multiply', async () => {
    expect(await gateway.entry_point.multiply(6, 7)).toBe(42);
  });

  it2('divide', async () => {
    // 10.0 and 4.0 are integers in JS (Number.isInteger(10.0) === true) and encode
    // as INTEGER_TYPE; Java's divide(double,double) only accepts doubles.
    // Use non-integer values so they encode as DOUBLE_TYPE.
    expect(await gateway.entry_point.divide(5.5, 2.2)).toBeCloseTo(2.5);
  });
});

describe('Integration: strings', () => {
  it2('greet returns correct string', async () => {
    expect(await gateway.entry_point.greet('World')).toBe('Hello, World!');
  });

  it2('concatenate strings', async () => {
    expect(await gateway.entry_point.concatenate('foo', 'bar')).toBe('foobar');
  });

  it2('string length', async () => {
    expect(await gateway.entry_point.stringLength('hello')).toBe(5);
  });

  it2('toUpperCase', async () => {
    expect(await gateway.entry_point.toUpperCase('hello')).toBe('HELLO');
  });

  it2('containsSubstring true', async () => {
    expect(await gateway.entry_point.containsSubstring('foobar', 'oba')).toBe(true);
  });

  it2('containsSubstring false', async () => {
    expect(await gateway.entry_point.containsSubstring('foobar', 'xyz')).toBe(false);
  });

  it2('repeatString', async () => {
    expect(await gateway.entry_point.repeatString('ab', 3)).toBe('ababab');
  });
});

describe('Integration: booleans', () => {
  it2('andBool(true, true)', async () => {
    expect(await gateway.entry_point.andBool(true, true)).toBe(true);
  });
  it2('andBool(true, false)', async () => {
    expect(await gateway.entry_point.andBool(true, false)).toBe(false);
  });
  it2('orBool(false, true)', async () => {
    expect(await gateway.entry_point.orBool(false, true)).toBe(true);
  });
  it2('notBool(true)', async () => {
    expect(await gateway.entry_point.notBool(true)).toBe(false);
  });
});

describe('Integration: null handling', () => {
  it2('maybeNull(true) returns null', async () => {
    expect(await gateway.entry_point.maybeNull(true)).toBeNull();
  });

  it2('maybeNull(false) returns string', async () => {
    expect(await gateway.entry_point.maybeNull(false)).toBe('not null');
  });
});

describe('Integration: type round-trips', () => {
  it2('echo integer', async () => {
    expect(await gateway.entry_point.echoInt(42)).toBe(42);
  });
  it2('echo negative integer', async () => {
    expect(await gateway.entry_point.echoInt(-99)).toBe(-99);
  });
  it2('echo long', async () => {
    expect(await gateway.entry_point.echoLong(1000000000000)).toBe(1000000000000);
  });
  it2('echo double', async () => {
    expect(await gateway.entry_point.echoDouble(3.14)).toBeCloseTo(3.14);
  });
  it2('echo boolean true', async () => {
    expect(await gateway.entry_point.echoBool(true)).toBe(true);
  });
  it2('echo boolean false', async () => {
    expect(await gateway.entry_point.echoBool(false)).toBe(false);
  });
  it2('echo string', async () => {
    expect(await gateway.entry_point.echoString('js4j')).toBe('js4j');
  });
});

describe('Integration: Java collections', () => {
  it2('getStringList() size', async () => {
    const list = await gateway.entry_point.getStringList();
    expect(await list.size()).toBe(3);
  });

  it2('getStringList() get(0)', async () => {
    const list = await gateway.entry_point.getStringList();
    expect(await list.get(0)).toBe('alpha');
  });

  it2('getStringList() get(2)', async () => {
    const list = await gateway.entry_point.getStringList();
    expect(await list.get(2)).toBe('gamma');
  });

  it2('getIntList() get(4)', async () => {
    const list = await gateway.entry_point.getIntList();
    expect(await list.get(4)).toBe(5);
  });

  it2('getStringSet() size', async () => {
    const set = await gateway.entry_point.getStringSet();
    expect(await set.size()).toBe(3);
  });

  it2('getStringSet() contains existing', async () => {
    const set = await gateway.entry_point.getStringSet();
    expect(await set.contains('one')).toBe(true);
  });

  it2('getStringSet() contains missing', async () => {
    const set = await gateway.entry_point.getStringSet();
    expect(await set.contains('xxx')).toBe(false);
  });

  it2('getStringIntMap() size', async () => {
    const map = await gateway.entry_point.getStringIntMap();
    expect(await map.size()).toBe(3);
  });

  it2('getStringIntMap() get("a")', async () => {
    const map = await gateway.entry_point.getStringIntMap();
    expect(await map.get('a')).toBe(1);
  });

  it2('getStringIntMap() containsKey("a")', async () => {
    const map = await gateway.entry_point.getStringIntMap();
    expect(await map.containsKey('a')).toBe(true);
  });

  it2('getStringIntMap() containsKey("z")', async () => {
    const map = await gateway.entry_point.getStringIntMap();
    expect(await map.containsKey('z')).toBe(false);
  });
});

describe('Integration: Java object (Counter)', () => {
  it2('createCounter returns object with getValue', async () => {
    const c = await gateway.entry_point.createCounter(10);
    expect(await c.getValue()).toBe(10);
  });

  it2('increment increases value', async () => {
    const c = await gateway.entry_point.createCounter(5);
    await c.increment();
    expect(await c.getValue()).toBe(6);
  });

  it2('add increases value by n', async () => {
    const c = await gateway.entry_point.createCounter(3);
    await c.add(7);
    expect(await c.getValue()).toBe(10);
  });

  it2('decrement decreases value', async () => {
    const c = await gateway.entry_point.createCounter(5);
    await c.decrement();
    expect(await c.getValue()).toBe(4);
  });

  it2('reset sets value to 0', async () => {
    const c = await gateway.entry_point.createCounter(100);
    await c.reset();
    expect(await c.getValue()).toBe(0);
  });
});

describe('Integration: exceptions', () => {
  it2('throwException raises Js4JJavaError', async () => {
    await expect(gateway.entry_point.throwException('boom')).rejects.toThrow(Js4JJavaError);
  });

  it2('divideByZero raises Js4JJavaError', async () => {
    await expect(gateway.entry_point.divideInts(10, 0)).rejects.toThrow(Js4JJavaError);
  });

  it2('exception message contains Java details', async () => {
    try {
      await gateway.entry_point.throwException('test error message');
    } catch (err) {
      expect(err.javaExceptionMessage).toBeTruthy();
    }
  });
});

describe('Integration: JVM namespace', () => {
  it2('Math.abs(-42)', async () => {
    expect(await gateway.jvm.java.lang.Math.abs(-42)).toBe(42);
  });

  it2('Math.max(3, 7)', async () => {
    expect(await gateway.jvm.java.lang.Math.max(3, 7)).toBe(7);
  });

  it2('Math.min(3, 7)', async () => {
    expect(await gateway.jvm.java.lang.Math.min(3, 7)).toBe(3);
  });

  it2('String.valueOf(123)', async () => {
    expect(await gateway.jvm.java.lang.String.valueOf(123)).toBe('123');
  });
});

describe('Integration: StringBuilder (constructor via JVM)', () => {
  it2('create and append', async () => {
    const sb = await gateway.jvm.java.lang.StringBuilder('Hello');
    await sb.append(' World');
    expect(await sb.toString()).toBe('Hello World');
  });

  it2('chain multiple appends', async () => {
    const sb = await gateway.jvm.java.lang.StringBuilder();
    await sb.append('a');
    await sb.append('b');
    await sb.append('c');
    expect(await sb.toString()).toBe('abc');
  });
});

describe('Integration: ArrayList (constructor via JVM)', () => {
  it2('create and add elements', async () => {
    const list = await gateway.jvm.java.util.ArrayList();
    await list.add('x');
    await list.add('y');
    expect(await list.size()).toBe(2);
    expect(await list.get(0)).toBe('x');
  });
});
