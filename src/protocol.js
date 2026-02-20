'use strict';

const { Js4JJavaError, Js4JError, Js4JNetworkError } = require('./exceptions');

// ---------------------------------------------------------------------------
// Command names (match py4j's protocol exactly)
// ---------------------------------------------------------------------------
const CALL_COMMAND_NAME = 'c\n';
const CONSTRUCTOR_COMMAND_NAME = 'i\n';
const FIELD_COMMAND_NAME = 'f\n';
const SHUTDOWN_GATEWAY_COMMAND_NAME = 's\n';
const LIST_COMMAND_NAME = 'l\n';
const ARRAY_COMMAND_NAME = 'a\n';       // array get/set/slice/len/create
const TABLE_COMMAND_NAME = 't\n';
const JVMVIEW_COMMAND_NAME = 'j\n';
const REFLECTION_COMMAND_NAME = 'r\n';
const MEMORY_COMMAND_NAME = 'm\n';
const HELP_COMMAND_NAME = 'h\n';
const DIR_COMMAND_NAME = 'd\n';
const BYTES_COMMAND_NAME = 'b\n';
const AUTH_COMMAND_NAME = 'A\n';
const STREAM_COMMAND_NAME = 'S\n';

// Sub-commands for FIELD_COMMAND
const FIELD_GET_SUB_COMMAND_NAME = 'g\n';
const FIELD_SET_SUB_COMMAND_NAME = 's\n';

// Sub-commands for JVMVIEW_COMMAND
const JVMVIEW_CLASS_SUB_COMMAND_NAME = 'c\n';
const JVMVIEW_IMPORT_SUB_COMMAND_NAME = 'i\n';
const JVMVIEW_SEARCH_SUB_COMMAND_NAME = 's\n';
const JVMVIEW_REMOVE_IMPORT_SUB_COMMAND_NAME = 'r\n';

// Sub-commands for ARRAY_COMMAND
const ARRAY_GET_SUB_COMMAND_NAME = 'g\n';
const ARRAY_SET_SUB_COMMAND_NAME = 's\n';
const ARRAY_SLICE_SUB_COMMAND_NAME = 'l\n';
const ARRAY_LEN_SUB_COMMAND_NAME = 'e\n';
const ARRAY_CREATE_SUB_COMMAND_NAME = 'c\n';

// Sub-commands for MEMORY_COMMAND
// MEMORY_DEL: Python-side GC notification — tells Java to release the object reference.
// MEMORY_ATTACH: mark an object as referenced again (used by FinalizerWorker).
const MEMORY_DEL_SUB_COMMAND_NAME = 'd\n';
const MEMORY_ATTACH_SUB_COMMAND_NAME = 'a\n';

// Sub-commands for LIST_COMMAND
const LIST_SORT_SUBCOMMAND_NAME = 's\n';
const LIST_REVERSE_SUBCOMMAND_NAME = 'r\n';
const LIST_SLICE_SUBCOMMAND_NAME = 'l\n';
const LIST_CONCAT_SUBCOMMAND_NAME = 'a\n';
const LIST_MULT_SUBCOMMAND_NAME = 'm\n';
const LIST_IMULT_SUBCOMMAND_NAME = 'i\n';
const LIST_COUNT_SUBCOMMAND_NAME = 'f\n';

// Sub-commands for REFLECTION_COMMAND
const REFL_GET_UNKNOWN_SUB_COMMAND_NAME = 'u\n';
const REFL_GET_MEMBER_SUB_COMMAND_NAME = 'm\n';
const REFL_GET_JAVA_LANG_STRING_SUB_COMMAND_NAME = 's\n';

// Sub-commands for DIR_COMMAND
const DIR_FIELDS_SUBCOMMAND_NAME = 'f\n';
const DIR_METHODS_SUBCOMMAND_NAME = 'm\n';
const DIR_STATIC_SUBCOMMAND_NAME = 's\n';    // static members of a class
const DIR_JVMVIEW_SUBCOMMAND_NAME = 'v\n';  // members visible in a JVMView

// Sub-commands for HELP_COMMAND
const HELP_OBJECT_SUBCOMMAND_NAME = 'o\n';
const HELP_CLASS_SUBCOMMAND_NAME = 'c\n';

// ---------------------------------------------------------------------------
// Type prefixes  (verified against py4j Protocol.class bytecode)
// ---------------------------------------------------------------------------
const REFERENCE_TYPE  = 'r';   // Java object reference
const DOUBLE_TYPE     = 'd';
const LONG_TYPE       = 'L';   // uppercase L (distinct from LIST_TYPE 'l')
const INTEGER_TYPE    = 'i';
const BOOLEAN_TYPE    = 'b';
const STRING_TYPE     = 's';
const BYTES_TYPE      = 'j';
const DECIMAL_TYPE    = 'D';
const NULL_TYPE       = 'n';
const VOID_TYPE       = 'v';
const PYTHON_PROXY_TYPE = 'f'; // 'p' is PACKAGE_TYPE in the Java protocol
const LIST_TYPE       = 'l';   // lowercase l
const SET_TYPE        = 'h';
const ARRAY_TYPE      = 't';
const MAP_TYPE        = 'a';
const ITERATOR_TYPE   = 'g';

// ---------------------------------------------------------------------------
// Response codes
// ---------------------------------------------------------------------------
const SUCCESS         = 'y';
const ERROR           = 'x';
const FATAL_ERROR     = 'z';
const RETURN_MESSAGE  = '!'; // Java always prefixes every response with this
const END = 'e';
const END_COMMAND_PART = '\n';

// Special object IDs
const ENTRY_POINT_OBJECT_ID = 't';
const STATIC_PREFIX = 'z:'; // prefix for static method/field calls (matches py4j's STATIC_PREFIX)
const DEFAULT_JVM_ID = 'rj';  // ID of the default JVMView on the Java side (py4j DEFAULT_JVM_ID)

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

/**
 * Encode a JS value to a py4j protocol command part string (with trailing \n).
 * @param {*} value
 * @param {Map} [proxyPool] - JS proxy pool for callback objects
 * @returns {string}
 */
function encodeCommandPart(value, proxyPool) {
  if (value === null || value === undefined) {
    return NULL_TYPE + END_COMMAND_PART;
  }

  if (typeof value === 'boolean') {
    return BOOLEAN_TYPE + (value ? 'true' : 'false') + END_COMMAND_PART;
  }

  if (typeof value === 'bigint') {
    return LONG_TYPE + value.toString() + END_COMMAND_PART;
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value) && value >= -2147483648 && value <= 2147483647) {
      return INTEGER_TYPE + value.toString() + END_COMMAND_PART;
    }
    // Check if it's a safe long (fits in 64-bit int)
    if (Number.isInteger(value)) {
      return LONG_TYPE + value.toString() + END_COMMAND_PART;
    }
    return DOUBLE_TYPE + value.toString() + END_COMMAND_PART;
  }

  if (typeof value === 'string') {
    return STRING_TYPE + escapeNewLines(value) + END_COMMAND_PART;
  }

  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return BYTES_TYPE + Buffer.from(value).toString('base64') + END_COMMAND_PART;
  }

  // JavaObject / JavaClass with a _targetId (set by our wrappers)
  if (value && typeof value === 'object' && value._targetId !== undefined) {
    return REFERENCE_TYPE + value._targetId + END_COMMAND_PART;
  }

  // JS callback proxy (for Java interface implementations)
  if (proxyPool && value && value._js4jProxy === true) {
    const proxyId = proxyPool.register(value);
    const interfaces = (value._interfaces || []).join(';');
    return PYTHON_PROXY_TYPE + proxyId + ';' + interfaces + END_COMMAND_PART;
  }

  // Auto-convert JS arrays to ArrayList
  if (Array.isArray(value)) {
    // Encode as reference to a temporary list — caller must handle auto_convert
    throw new Js4JError(
      'Cannot auto-convert JS Array to Java object without auto_convert=true'
    );
  }

  throw new Js4JError(`Cannot encode value of type ${typeof value}: ${value}`);
}

/**
 * Decode a py4j protocol response line to a JS value.
 * @param {string} answer - Full response line (e.g. "yi42" or "ysHello")
 * @param {object} gatewayClient - The GatewayClient instance for wrapping objects
 * @returns {*}
 */
function decodeReturnValue(answer, gatewayClient) {
  if (!answer || answer.length === 0) {
    throw new Js4JNetworkError('Received empty response from gateway');
  }

  // Java always prefixes every response with RETURN_MESSAGE ('!')
  if (answer[0] === RETURN_MESSAGE) {
    answer = answer.slice(1);
  }

  const responseCode = answer[0];

  if (responseCode === FATAL_ERROR) {
    throw new Js4JError('Fatal error from gateway: ' + answer.slice(1));
  }

  if (responseCode === ERROR) {
    // Error payload is a typed value — usually REFERENCE_TYPE + objectId for
    // a Java Throwable registered in the gateway (e.g. "ro0").
    const errPayload = answer.slice(1);
    let javaException = null;
    try {
      const typePrefix = errPayload[0];
      const value = errPayload.slice(1);
      javaException = decodeTypedValue(typePrefix, value, gatewayClient);
    } catch (_) {}
    throw new Js4JJavaError(
      'An error occurred while calling a Java method.',
      errPayload,
      javaException
    );
  }

  if (responseCode !== SUCCESS) {
    throw new Js4JNetworkError('Unexpected response code: ' + responseCode);
  }

  // SUCCESS path
  if (answer.length < 2) {
    return null; // void / empty success
  }

  const typePrefix = answer[1];
  const value = answer.slice(2);

  return decodeTypedValue(typePrefix, value, gatewayClient);
}

/**
 * Decode a typed value (type prefix + raw string) to a JS value.
 */
function decodeTypedValue(typePrefix, value, gatewayClient) {
  switch (typePrefix) {
    case VOID_TYPE:
      return null;

    case NULL_TYPE:
      return null;

    case BOOLEAN_TYPE:
      return value.toLowerCase() === 'true';

    case INTEGER_TYPE:
      return parseInt(value, 10);

    case LONG_TYPE:
      // Return BigInt if it overflows safe integer range
      try {
        const n = parseInt(value, 10);
        if (n > Number.MAX_SAFE_INTEGER || n < Number.MIN_SAFE_INTEGER) {
          return BigInt(value);
        }
        return n;
      } catch (e) {
        return BigInt(value);
      }

    case DOUBLE_TYPE:
      return parseFloat(value);

    case DECIMAL_TYPE:
      // Return as string to preserve precision (like Python Decimal)
      return value;

    case STRING_TYPE:
      return unescapeNewLines(value);

    case BYTES_TYPE:
      return Buffer.from(value, 'base64');

    case REFERENCE_TYPE:
      return gatewayClient._wrapObject(value, REFERENCE_TYPE);

    case LIST_TYPE:
      return gatewayClient._wrapObject(value, LIST_TYPE);

    case SET_TYPE:
      return gatewayClient._wrapObject(value, SET_TYPE);

    case MAP_TYPE:
      return gatewayClient._wrapObject(value, MAP_TYPE);

    case ARRAY_TYPE:
      return gatewayClient._wrapObject(value, ARRAY_TYPE);

    case ITERATOR_TYPE:
      return gatewayClient._wrapObject(value, ITERATOR_TYPE);

    case PYTHON_PROXY_TYPE:
      // Java is returning a Python/JS proxy back to us — look it up
      return gatewayClient._lookupProxy(value);

    default:
      throw new Js4JError(`Unknown type prefix '${typePrefix}' in value: ${value}`);
  }
}

// ---------------------------------------------------------------------------
// String escaping (py4j uses \n as separator, so newlines in strings get escaped)
// ---------------------------------------------------------------------------

/**
 * Escape newlines in a string value so it can be sent as a single command part.
 * py4j uses \n as separator; literal newlines become \\n.
 */
function escapeNewLines(s) {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
}

/**
 * Unescape newlines in a received string value.
 */
function unescapeNewLines(s) {
  return s.replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
}

module.exports = {
  // Command names
  CALL_COMMAND_NAME,
  CONSTRUCTOR_COMMAND_NAME,
  FIELD_COMMAND_NAME,
  SHUTDOWN_GATEWAY_COMMAND_NAME,
  LIST_COMMAND_NAME,
  ARRAY_COMMAND_NAME,
  TABLE_COMMAND_NAME,
  JVMVIEW_COMMAND_NAME,
  REFLECTION_COMMAND_NAME,
  MEMORY_COMMAND_NAME,
  HELP_COMMAND_NAME,
  DIR_COMMAND_NAME,
  BYTES_COMMAND_NAME,
  AUTH_COMMAND_NAME,
  STREAM_COMMAND_NAME,

  // Field sub-commands
  FIELD_GET_SUB_COMMAND_NAME,
  FIELD_SET_SUB_COMMAND_NAME,

  // JVMView sub-commands
  JVMVIEW_CLASS_SUB_COMMAND_NAME,
  JVMVIEW_IMPORT_SUB_COMMAND_NAME,
  JVMVIEW_SEARCH_SUB_COMMAND_NAME,
  JVMVIEW_REMOVE_IMPORT_SUB_COMMAND_NAME,

  // Array sub-commands
  ARRAY_GET_SUB_COMMAND_NAME,
  ARRAY_SET_SUB_COMMAND_NAME,
  ARRAY_SLICE_SUB_COMMAND_NAME,
  ARRAY_LEN_SUB_COMMAND_NAME,
  ARRAY_CREATE_SUB_COMMAND_NAME,

  // Memory sub-commands
  MEMORY_DEL_SUB_COMMAND_NAME,
  MEMORY_ATTACH_SUB_COMMAND_NAME,

  // List sub-commands
  LIST_SORT_SUBCOMMAND_NAME,
  LIST_REVERSE_SUBCOMMAND_NAME,
  LIST_SLICE_SUBCOMMAND_NAME,
  LIST_CONCAT_SUBCOMMAND_NAME,
  LIST_MULT_SUBCOMMAND_NAME,
  LIST_IMULT_SUBCOMMAND_NAME,
  LIST_COUNT_SUBCOMMAND_NAME,

  // Reflection sub-commands
  REFL_GET_UNKNOWN_SUB_COMMAND_NAME,
  REFL_GET_MEMBER_SUB_COMMAND_NAME,
  REFL_GET_JAVA_LANG_STRING_SUB_COMMAND_NAME,

  // Dir sub-commands
  DIR_FIELDS_SUBCOMMAND_NAME,
  DIR_METHODS_SUBCOMMAND_NAME,
  DIR_STATIC_SUBCOMMAND_NAME,
  DIR_JVMVIEW_SUBCOMMAND_NAME,

  // Help sub-commands
  HELP_OBJECT_SUBCOMMAND_NAME,
  HELP_CLASS_SUBCOMMAND_NAME,

  // Type prefixes
  REFERENCE_TYPE,
  DOUBLE_TYPE,
  LONG_TYPE,
  INTEGER_TYPE,
  BOOLEAN_TYPE,
  STRING_TYPE,
  BYTES_TYPE,
  DECIMAL_TYPE,
  NULL_TYPE,
  VOID_TYPE,
  PYTHON_PROXY_TYPE,
  LIST_TYPE,
  SET_TYPE,
  ARRAY_TYPE,
  MAP_TYPE,
  ITERATOR_TYPE,

  // Response codes
  SUCCESS,
  ERROR,
  FATAL_ERROR,
  RETURN_MESSAGE,
  END,
  END_COMMAND_PART,

  // Special IDs
  ENTRY_POINT_OBJECT_ID,
  STATIC_PREFIX,
  DEFAULT_JVM_ID,

  // Functions
  encodeCommandPart,
  decodeReturnValue,
  decodeTypedValue,
  escapeNewLines,
  unescapeNewLines,
};
