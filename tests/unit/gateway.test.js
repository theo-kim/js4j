'use strict';

/**
 * Unit tests for gateway-level functionality that can be tested without a
 * live Java server (using mocked connections).
 */

const { GatewayParameters, CallbackServerParameters } = require('../../src/gateway');
const { ProxyPool, createJavaProxy } = require('../../src/callbackServer');
const { createJavaObject } = require('../../src/javaObject');

// ---------------------------------------------------------------------------
// GatewayParameters
// ---------------------------------------------------------------------------

describe('GatewayParameters', () => {
  test('defaults', () => {
    const p = new GatewayParameters();
    expect(p.host).toBe('127.0.0.1');
    expect(p.port).toBe(25333);
    expect(p.authToken).toBeNull();
    expect(p.autoField).toBe(false);
    expect(p.autoConvert).toBe(false);
    expect(p.enableMemoryManagement).toBe(false);
    expect(p.poolSize).toBe(4);
  });

  test('custom values', () => {
    const p = new GatewayParameters({
      host: '0.0.0.0',
      port: 9999,
      authToken: 'secret',
      autoField: true,
      autoConvert: true,
      enableMemoryManagement: true,
      poolSize: 8,
    });
    expect(p.host).toBe('0.0.0.0');
    expect(p.port).toBe(9999);
    expect(p.authToken).toBe('secret');
    expect(p.autoField).toBe(true);
    expect(p.autoConvert).toBe(true);
    expect(p.enableMemoryManagement).toBe(true);
    expect(p.poolSize).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// CallbackServerParameters
// ---------------------------------------------------------------------------

describe('CallbackServerParameters', () => {
  test('defaults', () => {
    const p = new CallbackServerParameters();
    expect(p.host).toBe('127.0.0.1');
    expect(p.port).toBe(25334);
    expect(p.daemonize).toBe(true);
    expect(p.propagateException).toBe(false);
  });

  test('custom values', () => {
    const p = new CallbackServerParameters({
      host: '0.0.0.0',
      port: 25335,
      daemonize: false,
      propagateException: true,
    });
    expect(p.host).toBe('0.0.0.0');
    expect(p.port).toBe(25335);
    expect(p.daemonize).toBe(false);
    expect(p.propagateException).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ProxyPool
// ---------------------------------------------------------------------------

describe('ProxyPool', () => {
  test('register returns unique IDs', () => {
    const pool = new ProxyPool();
    const a = {};
    const b = {};
    const idA = pool.register(a);
    const idB = pool.register(b);
    expect(idA).not.toBe(idB);
    expect(idA).toMatch(/^p\d+$/);
  });

  test('get returns registered object', () => {
    const pool = new ProxyPool();
    const obj = { method: () => 42 };
    const id = pool.register(obj);
    expect(pool.get(id)).toBe(obj);
  });

  test('remove deletes the entry', () => {
    const pool = new ProxyPool();
    const id = pool.register({});
    pool.remove(id);
    expect(pool.get(id)).toBeNull();
  });

  test('has() returns correct boolean', () => {
    const pool = new ProxyPool();
    const id = pool.register({});
    expect(pool.has(id)).toBe(true);
    pool.remove(id);
    expect(pool.has(id)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createJavaProxy
// ---------------------------------------------------------------------------

describe('createJavaProxy', () => {
  test('creates an object with _js4jProxy flag', () => {
    const proxy = createJavaProxy(['java.lang.Runnable'], { run: () => {} });
    expect(proxy._js4jProxy).toBe(true);
  });

  test('stores interfaces', () => {
    const proxy = createJavaProxy(['java.lang.Runnable', 'java.lang.Comparable'], {});
    expect(proxy._interfaces).toEqual(['java.lang.Runnable', 'java.lang.Comparable']);
  });

  test('includes implementation methods', () => {
    const proxy = createJavaProxy(['java.lang.Runnable'], {
      run: () => 'ran',
    });
    expect(typeof proxy.run).toBe('function');
    expect(proxy.run()).toBe('ran');
  });
});

// ---------------------------------------------------------------------------
// createJavaObject
// ---------------------------------------------------------------------------

describe('createJavaObject', () => {
  const mockClient = {
    async callMethod(targetId, method, args) {
      return { targetId, method, args };
    },
  };

  test('_targetId is accessible', () => {
    const obj = createJavaObject('o123', mockClient);
    expect(obj._targetId).toBe('o123');
  });

  test('method access returns async function', () => {
    const obj = createJavaObject('o1', mockClient);
    expect(typeof obj.someMethod).toBe('function');
  });

  test('method call invokes callMethod with correct args', async () => {
    const obj = createJavaObject('o1', mockClient);
    const result = await obj.greet('World');
    expect(result).toEqual({ targetId: 'o1', method: 'greet', args: ['World'] });
  });

  test('then is undefined (not a Promise)', () => {
    const obj = createJavaObject('o1', mockClient);
    expect(obj.then).toBeUndefined();
  });

  test('Symbol access is handled gracefully', () => {
    const obj = createJavaObject('o1', mockClient);
    expect(obj[Symbol.iterator]).toBeUndefined();
  });

  test('direct field assignment throws helpful error', () => {
    const obj = createJavaObject('o1', mockClient);
    expect(() => { obj.someField = 42; }).toThrow(/setField/);
  });
});
