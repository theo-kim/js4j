'use strict';

const {
  Js4JError,
  Js4JJavaError,
  Js4JNetworkError,
  Js4JAuthenticationError,
} = require('../../src/exceptions');

describe('Js4JError', () => {
  test('is an instance of Error', () => {
    const err = new Js4JError('test');
    expect(err).toBeInstanceOf(Error);
  });

  test('has correct name', () => {
    expect(new Js4JError('x').name).toBe('Js4JError');
  });

  test('has correct message', () => {
    expect(new Js4JError('something went wrong').message).toBe('something went wrong');
  });

  test('instanceof Js4JError', () => {
    expect(new Js4JError('x')).toBeInstanceOf(Js4JError);
  });
});

describe('Js4JJavaError', () => {
  test('extends Js4JError', () => {
    expect(new Js4JJavaError('msg', 'java trace')).toBeInstanceOf(Js4JError);
  });

  test('has correct name', () => {
    expect(new Js4JJavaError('m', 't').name).toBe('Js4JJavaError');
  });

  test('stores javaExceptionMessage', () => {
    const err = new Js4JJavaError('A occurred', 'java.lang.RuntimeException: A');
    expect(err.javaExceptionMessage).toBe('java.lang.RuntimeException: A');
  });

  test('toString includes Java trace', () => {
    const err = new Js4JJavaError('msg', 'trace here');
    expect(err.toString()).toContain('trace here');
  });

  test('javaExceptionMessage defaults to empty string', () => {
    const err = new Js4JJavaError('msg');
    expect(err.javaExceptionMessage).toBe('');
  });
});

describe('Js4JNetworkError', () => {
  test('extends Js4JError', () => {
    expect(new Js4JNetworkError('net')).toBeInstanceOf(Js4JError);
  });

  test('has correct name', () => {
    expect(new Js4JNetworkError('net').name).toBe('Js4JNetworkError');
  });
});

describe('Js4JAuthenticationError', () => {
  test('extends Js4JError', () => {
    expect(new Js4JAuthenticationError()).toBeInstanceOf(Js4JError);
  });

  test('has correct name', () => {
    expect(new Js4JAuthenticationError().name).toBe('Js4JAuthenticationError');
  });

  test('default message', () => {
    expect(new Js4JAuthenticationError().message).toBe('Authentication failed');
  });

  test('custom message', () => {
    expect(new Js4JAuthenticationError('bad token').message).toBe('bad token');
  });
});

describe('Error hierarchy', () => {
  test('all errors are instanceof Error', () => {
    expect(new Js4JError('x')).toBeInstanceOf(Error);
    expect(new Js4JJavaError('x', 'y')).toBeInstanceOf(Error);
    expect(new Js4JNetworkError('x')).toBeInstanceOf(Error);
    expect(new Js4JAuthenticationError()).toBeInstanceOf(Error);
  });

  test('Js4JJavaError is NOT instanceof Js4JNetworkError', () => {
    expect(new Js4JJavaError('x', 'y')).not.toBeInstanceOf(Js4JNetworkError);
  });

  test('can be caught as Js4JError', () => {
    function throwIt() { throw new Js4JJavaError('boom', 'trace'); }
    expect(throwIt).toThrow(Js4JError);
  });

  test('stack trace is available', () => {
    const err = new Js4JError('oops');
    expect(typeof err.stack).toBe('string');
    expect(err.stack).toContain('Js4JError');
  });
});
