'use strict';

const {
  CALL_COMMAND_NAME,
  CONSTRUCTOR_COMMAND_NAME,
  FIELD_COMMAND_NAME,
  FIELD_GET_SUB_COMMAND_NAME,
  FIELD_SET_SUB_COMMAND_NAME,
  MEMORY_COMMAND_NAME,
  MEMORY_DEL_SUB_COMMAND_NAME,
  DIR_COMMAND_NAME,
  DIR_FIELDS_SUBCOMMAND_NAME,
  DIR_METHODS_SUBCOMMAND_NAME,
  DIR_STATIC_SUBCOMMAND_NAME,
  HELP_COMMAND_NAME,
  HELP_OBJECT_SUBCOMMAND_NAME,
  REFLECTION_COMMAND_NAME,
  REFL_GET_MEMBER_SUB_COMMAND_NAME,
  STATIC_PREFIX,
  END,
  END_COMMAND_PART,
  encodeCommandPart,
  decodeReturnValue,
} = require('./protocol');

// Symbols used to expose internal state without polluting method namespace
const TARGET_ID = Symbol('targetId');
const CLIENT = Symbol('client');
const CLASS_FQN = Symbol('classFqn');

/**
 * Build the argument section of a command string from a JS args array.
 */
function buildArgsCommand(args, proxyPool) {
  let s = '';
  for (const arg of args) {
    s += encodeCommandPart(arg, proxyPool);
  }
  return s;
}

/**
 * Wrap a raw Java object ID returned by the gateway into a typed wrapper.
 * The GatewayClient calls this internally via _wrapObject().
 */
function wrapJavaObject(targetId, typeHint, gatewayClient) {
  const {
    LIST_TYPE,
    SET_TYPE,
    MAP_TYPE,
    ARRAY_TYPE,
    ITERATOR_TYPE,
  } = require('./protocol');

  const {
    createJavaList,
    createJavaSet,
    createJavaMap,
    createJavaArray,
    createJavaIterator,
  } = require('./collections');

  switch (typeHint) {
    case LIST_TYPE:
      return createJavaList(targetId, gatewayClient);
    case SET_TYPE:
      return createJavaSet(targetId, gatewayClient);
    case MAP_TYPE:
      return createJavaMap(targetId, gatewayClient);
    case ARRAY_TYPE:
      return createJavaArray(targetId, gatewayClient);
    case ITERATOR_TYPE:
      return createJavaIterator(targetId, gatewayClient);
    default:
      return createJavaObject(targetId, gatewayClient);
  }
}

/**
 * Create a Proxy that wraps a Java object reference.
 *
 * Property access returns an async method caller:
 *   const result = await javaObj.someMethod(arg1, arg2);
 *
 * Mirrors py4j's JavaObject class.
 */
function createJavaObject(targetId, gatewayClient) {
  const internal = {
    [TARGET_ID]: targetId,
    [CLIENT]: gatewayClient,
    _targetId: targetId,
    _gatewayClient: gatewayClient,
  };

  const handler = {
    get(target, prop, receiver) {
      if (typeof prop === 'symbol') return target[prop];
      if (Object.prototype.hasOwnProperty.call(target, prop)) return target[prop];
      if (prop === 'then') return undefined;
      return (...args) => gatewayClient.callMethod(targetId, prop, args);
    },

    set(target, prop, value) {
      if (prop in target) {
        target[prop] = value;
        return true;
      }
      throw new Error(
        `Cannot set Java field '${prop}' with assignment. Use gateway.setField(obj, '${prop}', value) instead.`
      );
    },

    has(target, prop) {
      if (prop in target) return true;
      return false;
    },
  };

  return new Proxy(internal, handler);
}

/**
 * Low-level gateway client methods used by JavaObject, JavaClass, etc.
 * These are mixed into the GatewayClient prototype in gateway.js.
 */
const gatewayMethods = {
  async callMethod(targetId, methodName, args) {
    const argsStr = buildArgsCommand(args, this._proxyPool);
    const command =
      CALL_COMMAND_NAME +
      targetId + END_COMMAND_PART +
      methodName + END_COMMAND_PART +
      argsStr +
      END + END_COMMAND_PART;
    const answer = await this._sendCommand(command);
    return decodeReturnValue(answer, this);
  },

  async callConstructor(classFqn, args) {
    const argsStr = buildArgsCommand(args, this._proxyPool);
    const command =
      CONSTRUCTOR_COMMAND_NAME +
      classFqn + END_COMMAND_PART +
      argsStr +
      END + END_COMMAND_PART;
    const answer = await this._sendCommand(command);
    return decodeReturnValue(answer, this);
  },

  async getField(targetOrId, fieldName) {
    const targetId = typeof targetOrId === 'string' ? targetOrId : targetOrId._targetId;

    // Static fields on classes: targetId has the "z:" prefix (STATIC_PREFIX).
    // The FIELD_GET command only handles registered object instances, not class FQNs.
    // Use the REFLECTION GET_MEMBER command instead — this is what py4j Python does.
    if (targetId.startsWith(STATIC_PREFIX)) {
      const fqn = targetId.slice(STATIC_PREFIX.length);
      const command =
        REFLECTION_COMMAND_NAME +
        REFL_GET_MEMBER_SUB_COMMAND_NAME +
        fqn + END_COMMAND_PART +
        fieldName + END_COMMAND_PART +
        END + END_COMMAND_PART;
      const answer = await this._sendCommand(command);
      return decodeReturnValue(answer, this);
    }

    const command =
      FIELD_COMMAND_NAME +
      FIELD_GET_SUB_COMMAND_NAME +
      targetId + END_COMMAND_PART +
      fieldName + END_COMMAND_PART +
      END + END_COMMAND_PART;
    const answer = await this._sendCommand(command);
    return decodeReturnValue(answer, this);
  },

  async setField(targetOrId, fieldName, value) {
    const targetId = typeof targetOrId === 'string' ? targetOrId : targetOrId._targetId;
    const command =
      FIELD_COMMAND_NAME +
      FIELD_SET_SUB_COMMAND_NAME +
      targetId + END_COMMAND_PART +
      fieldName + END_COMMAND_PART +
      encodeCommandPart(value, this._proxyPool) +
      END + END_COMMAND_PART;
    const answer = await this._sendCommand(command);
    return decodeReturnValue(answer, this);
  },

  async releaseObject(targetId) {
    const command =
      MEMORY_COMMAND_NAME +
      MEMORY_DEL_SUB_COMMAND_NAME +
      targetId + END_COMMAND_PART +
      END + END_COMMAND_PART;
    try {
      await this._sendCommand(command);
    } catch (_) {}
  },

  async getMethods(targetOrId) {
    const targetId = typeof targetOrId === 'string' ? targetOrId : targetOrId._targetId;
    const command =
      DIR_COMMAND_NAME +
      DIR_METHODS_SUBCOMMAND_NAME +
      targetId + END_COMMAND_PART +
      END + END_COMMAND_PART;
    const answer = await this._sendCommand(command);
    const decoded = decodeReturnValue(answer, this);
    if (typeof decoded === 'string') return decoded.split('\n').filter(Boolean);
    return decoded;
  },

  async getFields(targetOrId) {
    const targetId = typeof targetOrId === 'string' ? targetOrId : targetOrId._targetId;
    const command =
      DIR_COMMAND_NAME +
      DIR_FIELDS_SUBCOMMAND_NAME +
      targetId + END_COMMAND_PART +
      END + END_COMMAND_PART;
    const answer = await this._sendCommand(command);
    const decoded = decodeReturnValue(answer, this);
    if (typeof decoded === 'string') return decoded.split('\n').filter(Boolean);
    return decoded;
  },

  async getStaticMembers(classOrId) {
    const targetId = typeof classOrId === 'string' ? classOrId : (classOrId._fqn || classOrId._targetId);
    const command =
      DIR_COMMAND_NAME +
      DIR_STATIC_SUBCOMMAND_NAME +
      targetId + END_COMMAND_PART +
      END + END_COMMAND_PART;
    const answer = await this._sendCommand(command);
    const decoded = decodeReturnValue(answer, this);
    if (typeof decoded === 'string') return decoded.split('\n').filter(Boolean);
    return decoded;
  },

  async help(targetOrId, pattern) {
    const targetId = typeof targetOrId === 'string' ? targetOrId : targetOrId._targetId;
    let command =
      HELP_COMMAND_NAME +
      HELP_OBJECT_SUBCOMMAND_NAME +
      targetId + END_COMMAND_PART;
    if (pattern) {
      command += pattern + END_COMMAND_PART;
    }
    command += END + END_COMMAND_PART;
    const answer = await this._sendCommand(command);
    return decodeReturnValue(answer, this);
  },

  _wrapObject(targetId, typeHint) {
    return wrapJavaObject(targetId, typeHint, this);
  },

  _lookupProxy(proxyId) {
    if (this._proxyPool) {
      return this._proxyPool.get(proxyId);
    }
    return null;
  },
};

module.exports = { createJavaObject, wrapJavaObject, gatewayMethods, buildArgsCommand, TARGET_ID, CLIENT };
