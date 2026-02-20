'use strict';

const { JVMView, createJavaClass, createJavaPackage } = require('../../src/jvmView');

// Minimal stub client
const stubClient = {
  async callMethod(targetId, methodName, args) {
    return { _call: { targetId, methodName, args } };
  },
  async callConstructor(fqn, args) {
    return { _ctor: { fqn, args } };
  },
  async _sendCommand() { return 'yv'; },
  _wrapObject: (id) => ({ _targetId: id }),
  _lookupProxy: () => null,
  _proxyPool: null,
};

describe('createJavaClass', () => {
  test('has correct _fqn', () => {
    const cls = createJavaClass('java.lang.String', stubClient);
    expect(cls._fqn).toBe('java.lang.String');
  });

  test('has _targetId equal to z:<fqn> (for static calls)', () => {
    const cls = createJavaClass('java.lang.Math', stubClient);
    expect(cls._targetId).toBe('z:java.lang.Math');
  });

  test('static method access returns async function', () => {
    const cls = createJavaClass('java.lang.Math', stubClient);
    expect(typeof cls.abs).toBe('function');
  });

  test('static method call invokes callMethod with z:<fqn> as target', async () => {
    const cls = createJavaClass('java.lang.Math', stubClient);
    const result = await cls.abs(-5);
    expect(result._call.targetId).toBe('z:java.lang.Math');
    expect(result._call.methodName).toBe('abs');
    expect(result._call.args).toEqual([-5]);
  });

  test('calling class as function invokes constructor', async () => {
    const cls = createJavaClass('java.lang.StringBuilder', stubClient);
    const result = await cls('hello');
    expect(result._ctor.fqn).toBe('java.lang.StringBuilder');
    expect(result._ctor.args).toEqual(['hello']);
  });

  test('Symbol properties are not proxied', () => {
    const cls = createJavaClass('java.lang.String', stubClient);
    expect(cls[Symbol.iterator]).toBeUndefined();
  });

  test('.then is undefined (not a Promise)', () => {
    const cls = createJavaClass('java.lang.String', stubClient);
    expect(cls.then).toBeUndefined();
  });
});

describe('createJavaPackage', () => {
  test('uppercase child becomes JavaClass', () => {
    const pkg = createJavaPackage('java.lang', stubClient);
    const cls = pkg.String;
    expect(cls._fqn).toBe('java.lang.String');
    expect(cls._isJavaClass).toBe(true);
  });

  test('lowercase child stays JavaPackage', () => {
    const pkg = createJavaPackage('java', stubClient);
    const subpkg = pkg.lang;
    expect(subpkg._fqn).toBe('java.lang');
    expect(subpkg._isJavaPackage).toBe(true);
  });

  test('chain: java.lang.Math._fqn', () => {
    const pkg = createJavaPackage('java', stubClient);
    expect(pkg.lang.Math._fqn).toBe('java.lang.Math');
  });

  test('calling package as function throws', () => {
    const pkg = createJavaPackage('java', stubClient);
    expect(() => pkg()).toThrow();
  });
});

describe('JVMView', () => {
  test('jvm.java is a JavaPackage', () => {
    const jvm = new JVMView(stubClient);
    const pkg = jvm.java;
    expect(pkg._isJavaPackage).toBe(true);
    expect(pkg._fqn).toBe('java');
  });

  test('jvm.java.lang.String is a JavaClass', () => {
    const jvm = new JVMView(stubClient);
    const cls = jvm.java.lang.String;
    expect(cls._isJavaClass).toBe(true);
    expect(cls._fqn).toBe('java.lang.String');
  });

  test('jvm.java.util.ArrayList is a JavaClass', () => {
    const jvm = new JVMView(stubClient);
    const cls = jvm.java.util.ArrayList;
    expect(cls._fqn).toBe('java.util.ArrayList');
  });

  test('.then on jvm is undefined (not a Promise)', () => {
    const jvm = new JVMView(stubClient);
    expect(jvm.then).toBeUndefined();
  });

  test('javaImport registers shortcut', async () => {
    const jvm = new JVMView(stubClient);
    await jvm.javaImport('java.util.ArrayList');
    const cls = jvm.ArrayList;
    expect(cls._fqn).toBe('java.util.ArrayList');
  });

  test('getClass returns JavaClass', () => {
    const jvm = new JVMView(stubClient);
    const cls = jvm.getClass('java.lang.Runtime');
    expect(cls._fqn).toBe('java.lang.Runtime');
    expect(cls._isJavaClass).toBe(true);
  });
});
