'use strict';

const {
  encodeCommandPart,
  decodeReturnValue,
  decodeTypedValue,
  escapeNewLines,
  unescapeNewLines,
  REFERENCE_TYPE,
  INTEGER_TYPE,
  LONG_TYPE,
  DOUBLE_TYPE,
  BOOLEAN_TYPE,
  STRING_TYPE,
  NULL_TYPE,
  VOID_TYPE,
  BYTES_TYPE,
  LIST_TYPE,
  SET_TYPE,
  MAP_TYPE,
  ARRAY_TYPE,
  ITERATOR_TYPE,
  SUCCESS,
  ERROR,
} = require('../../src/protocol');

const { Js4JJavaError, Js4JNetworkError, Js4JError } = require('../../src/exceptions');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal stub gatewayClient for decodeReturnValue tests */
const stubClient = {
  _wrapObject: (id, hint) => ({ _targetId: id, _typeHint: hint }),
  _lookupProxy: () => null,
};

// ---------------------------------------------------------------------------
// encodeCommandPart
// ---------------------------------------------------------------------------

describe('encodeCommandPart', () => {
  test('null encodes to NULL_TYPE', () => {
    expect(encodeCommandPart(null)).toBe('n\n');
  });

  test('undefined encodes to NULL_TYPE', () => {
    expect(encodeCommandPart(undefined)).toBe('n\n');
  });

  test('boolean true', () => {
    expect(encodeCommandPart(true)).toBe('btrue\n');
  });

  test('boolean false', () => {
    expect(encodeCommandPart(false)).toBe('bfalse\n');
  });

  test('small integer uses INTEGER_TYPE', () => {
    expect(encodeCommandPart(42)).toBe('i42\n');
    expect(encodeCommandPart(0)).toBe('i0\n');
    expect(encodeCommandPart(-99)).toBe('i-99\n');
    expect(encodeCommandPart(2147483647)).toBe('i2147483647\n');
    expect(encodeCommandPart(-2147483648)).toBe('i-2147483648\n');
  });

  test('large integer uses LONG_TYPE', () => {
    expect(encodeCommandPart(2147483648)).toBe('L2147483648\n');
    expect(encodeCommandPart(-2147483649)).toBe('L-2147483649\n');
    expect(encodeCommandPart(10 ** 12)).toBe('L1000000000000\n');
  });

  test('BigInt uses LONG_TYPE', () => {
    expect(encodeCommandPart(BigInt(100))).toBe('L100\n');
    expect(encodeCommandPart(BigInt(-1))).toBe('L-1\n');
  });

  test('float uses DOUBLE_TYPE', () => {
    expect(encodeCommandPart(3.14)).toBe('d3.14\n');
    // In JS, 0.0 === 0 (both are the same Number), so it encodes as integer
    expect(encodeCommandPart(0.0)).toBe('i0\n');
    expect(encodeCommandPart(-1.5)).toBe('d-1.5\n');
  });

  test('string uses STRING_TYPE', () => {
    expect(encodeCommandPart('hello')).toBe('shello\n');
    expect(encodeCommandPart('')).toBe('s\n');
  });

  test('string with newlines gets escaped', () => {
    const encoded = encodeCommandPart('line1\nline2');
    expect(encoded).toBe('sline1\\nline2\n');
  });

  test('Buffer/Uint8Array uses BYTES_TYPE (base64)', () => {
    const buf = Buffer.from('hello');
    const encoded = encodeCommandPart(buf);
    expect(encoded.startsWith(BYTES_TYPE)).toBe(true);
    const b64 = encoded.slice(1, -1); // strip type prefix and \n
    expect(Buffer.from(b64, 'base64').toString('utf8')).toBe('hello');
  });

  test('JavaObject uses REFERENCE_TYPE', () => {
    const jobj = { _targetId: 'o42' };
    expect(encodeCommandPart(jobj)).toBe('ro42\n');
  });

  test('plain JS array throws without auto_convert', () => {
    expect(() => encodeCommandPart([1, 2, 3])).toThrow(Js4JError);
  });
});

// ---------------------------------------------------------------------------
// escapeNewLines / unescapeNewLines
// ---------------------------------------------------------------------------

describe('escapeNewLines / unescapeNewLines', () => {
  test('round-trip plain string', () => {
    const s = 'hello world';
    expect(unescapeNewLines(escapeNewLines(s))).toBe(s);
  });

  test('round-trip string with newlines', () => {
    const s = 'line1\nline2\nline3';
    expect(unescapeNewLines(escapeNewLines(s))).toBe(s);
  });

  test('round-trip string with backslashes', () => {
    const s = 'path\\to\\file';
    expect(unescapeNewLines(escapeNewLines(s))).toBe(s);
  });

  test('escaped newline becomes literal', () => {
    expect(unescapeNewLines('line1\\nline2')).toBe('line1\nline2');
  });
});

// ---------------------------------------------------------------------------
// decodeReturnValue
// ---------------------------------------------------------------------------

describe('decodeReturnValue', () => {
  test('empty answer throws Js4JNetworkError', () => {
    expect(() => decodeReturnValue('', stubClient)).toThrow(Js4JNetworkError);
  });

  test('yv (success + void) returns null', () => {
    expect(decodeReturnValue('yv', stubClient)).toBeNull();
  });

  test('yn (success + null) returns null', () => {
    expect(decodeReturnValue('yn', stubClient)).toBeNull();
  });

  test('yi42 returns integer 42', () => {
    expect(decodeReturnValue('yi42', stubClient)).toBe(42);
  });

  test('yi-99 returns integer -99', () => {
    expect(decodeReturnValue('yi-99', stubClient)).toBe(-99);
  });

  test('yd3.14 returns float', () => {
    expect(decodeReturnValue('yd3.14', stubClient)).toBeCloseTo(3.14);
  });

  test('ybtrue returns boolean true', () => {
    expect(decodeReturnValue('ybtrue', stubClient)).toBe(true);
  });

  test('ybfalse returns boolean false', () => {
    expect(decodeReturnValue('ybfalse', stubClient)).toBe(false);
  });

  test('yshello returns string', () => {
    expect(decodeReturnValue('yshello', stubClient)).toBe('hello');
  });

  test('ys with escaped newline round-trips', () => {
    const answer = 'ys' + escapeNewLines('line1\nline2');
    expect(decodeReturnValue(answer, stubClient)).toBe('line1\nline2');
  });

  test('yr returns wrapped object (REFERENCE_TYPE = r)', () => {
    const result = decodeReturnValue('yro99', stubClient);
    expect(result).toEqual({ _targetId: 'o99', _typeHint: REFERENCE_TYPE });
  });

  test('yl returns wrapped list (LIST_TYPE = l)', () => {
    const result = decodeReturnValue('ylo5', stubClient);
    expect(result._typeHint).toBe(LIST_TYPE);
  });

  test('yh returns wrapped set (SET_TYPE = h)', () => {
    const result = decodeReturnValue('yho6', stubClient);
    expect(result._typeHint).toBe(SET_TYPE);
  });

  test('ya returns wrapped map (MAP_TYPE = a)', () => {
    const result = decodeReturnValue('yao7', stubClient);
    expect(result._typeHint).toBe(MAP_TYPE);
  });

  test('yt returns wrapped array (ARRAY_TYPE = t)', () => {
    const result = decodeReturnValue('yto8', stubClient);
    expect(result._typeHint).toBe(ARRAY_TYPE);
  });

  test('yg returns wrapped iterator (ITERATOR_TYPE = g)', () => {
    const result = decodeReturnValue('ygo9', stubClient);
    expect(result._typeHint).toBe(ITERATOR_TYPE);
  });

  test('! prefix is stripped before decoding', () => {
    expect(decodeReturnValue('!yi42', stubClient)).toBe(42);
    expect(decodeReturnValue('!yv', stubClient)).toBeNull();
  });

  test('x prefix raises Js4JJavaError (error payload is reference ro0)', () => {
    expect(() => decodeReturnValue('xro0', stubClient)).toThrow(Js4JJavaError);
  });

  test('Js4JJavaError.javaException is the decoded exception object', () => {
    try {
      decodeReturnValue('xro0', stubClient);
    } catch (err) {
      expect(err.javaException).toBeTruthy();
      expect(err.javaException._targetId).toBe('o0');
    }
  });

  test('unknown response code raises Js4JNetworkError', () => {
    expect(() => decodeReturnValue('?something', stubClient)).toThrow(Js4JNetworkError);
  });

  test('bytes type decodes from base64 (BYTES_TYPE = j)', () => {
    const original = Buffer.from('hello');
    const b64 = original.toString('base64');
    const result = decodeReturnValue('yj' + b64, stubClient);
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.toString('utf8')).toBe('hello');
  });

  test('long type returns number for safe integers (LONG_TYPE = L)', () => {
    expect(decodeReturnValue('yL12345', stubClient)).toBe(12345);
  });
});

// ---------------------------------------------------------------------------
// Command building (integration smoke tests for the protocol strings)
// ---------------------------------------------------------------------------

describe('Command format smoke tests', () => {
  const {
    CALL_COMMAND_NAME,
    CONSTRUCTOR_COMMAND_NAME,
    FIELD_COMMAND_NAME,
    FIELD_GET_SUB_COMMAND_NAME,
    END,
    END_COMMAND_PART,
  } = require('../../src/protocol');

  test('CALL command starts with c', () => {
    expect(CALL_COMMAND_NAME).toBe('c\n');
  });

  test('CONSTRUCTOR command starts with i', () => {
    expect(CONSTRUCTOR_COMMAND_NAME).toBe('i\n');
  });

  test('FIELD_GET command is f + g', () => {
    const cmd = FIELD_COMMAND_NAME + FIELD_GET_SUB_COMMAND_NAME + 'o1\n' + 'myField\n' + END + END_COMMAND_PART;
    expect(cmd).toBe('f\ng\no1\nmyField\ne\n');
  });

  test('END is e', () => {
    expect(END).toBe('e');
  });
});
