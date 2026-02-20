'use strict';

const {
  LIST_COMMAND_NAME,
  LIST_SORT_SUBCOMMAND_NAME,
  LIST_REVERSE_SUBCOMMAND_NAME,
  LIST_SLICE_SUBCOMMAND_NAME,
  LIST_CONCAT_SUBCOMMAND_NAME,
  LIST_MULT_SUBCOMMAND_NAME,
  LIST_IMULT_SUBCOMMAND_NAME,
  LIST_COUNT_SUBCOMMAND_NAME,
  ARRAY_COMMAND_NAME,
  ARRAY_GET_SUB_COMMAND_NAME,
  ARRAY_SET_SUB_COMMAND_NAME,
  ARRAY_SLICE_SUB_COMMAND_NAME,
  ARRAY_LEN_SUB_COMMAND_NAME,
  CALL_COMMAND_NAME,
  END,
  END_COMMAND_PART,
  INTEGER_TYPE,
  encodeCommandPart,
  decodeReturnValue,
} = require('./protocol');

function buildListCommand(subCmd, targetId, ...parts) {
  let cmd = LIST_COMMAND_NAME + subCmd + targetId + END_COMMAND_PART;
  for (const p of parts) { cmd += p; }
  cmd += END + END_COMMAND_PART;
  return cmd;
}

function buildCallCommand(targetId, method, args, gatewayClient) {
  const { buildArgsCommand } = require('./javaObject');
  const argsStr = buildArgsCommand(args, gatewayClient._proxyPool);
  return (
    CALL_COMMAND_NAME +
    targetId + END_COMMAND_PART +
    method + END_COMMAND_PART +
    argsStr +
    END + END_COMMAND_PART
  );
}

// ---------------------------------------------------------------------------
// JavaList — wraps java.util.List
// ---------------------------------------------------------------------------

function createJavaList(targetId, gatewayClient) {
  const obj = {
    _targetId: targetId,
    _gatewayClient: gatewayClient,
    _isJavaList: true,

    async size() { return gatewayClient.callMethod(targetId, 'size', []); },
    async get(index) { return gatewayClient.callMethod(targetId, 'get', [index]); },
    async add(element) { return gatewayClient.callMethod(targetId, 'add', [element]); },
    async addAt(index, element) { return gatewayClient.callMethod(targetId, 'add', [index, element]); },
    async remove(indexOrValue) { return gatewayClient.callMethod(targetId, 'remove', [indexOrValue]); },
    async set(index, element) { return gatewayClient.callMethod(targetId, 'set', [index, element]); },
    async clear() { return gatewayClient.callMethod(targetId, 'clear', []); },
    async contains(value) { return gatewayClient.callMethod(targetId, 'contains', [value]); },
    async indexOf(value) { return gatewayClient.callMethod(targetId, 'indexOf', [value]); },

    async subList(fromIndex, toIndex) {
      const answer = await gatewayClient._sendCommand(
        buildListCommand(
          LIST_SLICE_SUBCOMMAND_NAME, targetId,
          INTEGER_TYPE + fromIndex + END_COMMAND_PART,
          INTEGER_TYPE + toIndex + END_COMMAND_PART
        )
      );
      return decodeReturnValue(answer, gatewayClient);
    },

    async sort() {
      const answer = await gatewayClient._sendCommand(buildListCommand(LIST_SORT_SUBCOMMAND_NAME, targetId));
      return decodeReturnValue(answer, gatewayClient);
    },

    async reverse() {
      const answer = await gatewayClient._sendCommand(buildListCommand(LIST_REVERSE_SUBCOMMAND_NAME, targetId));
      return decodeReturnValue(answer, gatewayClient);
    },

    async count(value) {
      const answer = await gatewayClient._sendCommand(
        buildListCommand(LIST_COUNT_SUBCOMMAND_NAME, targetId, encodeCommandPart(value, gatewayClient._proxyPool))
      );
      return decodeReturnValue(answer, gatewayClient);
    },

    async *[Symbol.asyncIterator]() {
      const size = await this.size();
      for (let i = 0; i < size; i++) { yield await this.get(i); }
    },

    async toArray() {
      const size = await this.size();
      const result = [];
      for (let i = 0; i < size; i++) { result.push(await this.get(i)); }
      return result;
    },

    async call(method, ...args) { return gatewayClient.callMethod(targetId, method, args); },
  };

  return new Proxy(obj, {
    get(target, prop) {
      if (typeof prop === 'symbol') return target[prop];
      if (Object.prototype.hasOwnProperty.call(target, prop)) return target[prop];
      if (prop === 'then') return undefined;
      return (...args) => gatewayClient.callMethod(targetId, prop, args);
    },
  });
}

// ---------------------------------------------------------------------------
// JavaSet — wraps java.util.Set
// ---------------------------------------------------------------------------

function createJavaSet(targetId, gatewayClient) {
  const obj = {
    _targetId: targetId,
    _gatewayClient: gatewayClient,
    _isJavaSet: true,

    async size() { return gatewayClient.callMethod(targetId, 'size', []); },
    async add(element) { return gatewayClient.callMethod(targetId, 'add', [element]); },
    async remove(element) { return gatewayClient.callMethod(targetId, 'remove', [element]); },
    async contains(element) { return gatewayClient.callMethod(targetId, 'contains', [element]); },
    async clear() { return gatewayClient.callMethod(targetId, 'clear', []); },

    async toArray() {
      const iter = await gatewayClient.callMethod(targetId, 'iterator', []);
      const result = [];
      while (await iter.hasNext()) { result.push(await iter.next()); }
      return result;
    },

    async toSet() {
      const iter = await gatewayClient.callMethod(targetId, 'iterator', []);
      const result = new Set();
      while (await iter.hasNext()) { result.add(await iter.next()); }
      return result;
    },

    async *[Symbol.asyncIterator]() {
      const iter = await gatewayClient.callMethod(targetId, 'iterator', []);
      while (await iter.hasNext()) { yield await iter.next(); }
    },

    async call(method, ...args) { return gatewayClient.callMethod(targetId, method, args); },
  };

  return new Proxy(obj, {
    get(target, prop) {
      if (typeof prop === 'symbol') return target[prop];
      if (Object.prototype.hasOwnProperty.call(target, prop)) return target[prop];
      if (prop === 'then') return undefined;
      return (...args) => gatewayClient.callMethod(targetId, prop, args);
    },
  });
}

// ---------------------------------------------------------------------------
// JavaMap — wraps java.util.Map
// ---------------------------------------------------------------------------

function createJavaMap(targetId, gatewayClient) {
  const obj = {
    _targetId: targetId,
    _gatewayClient: gatewayClient,
    _isJavaMap: true,

    async size() { return gatewayClient.callMethod(targetId, 'size', []); },
    async get(key) { return gatewayClient.callMethod(targetId, 'get', [key]); },
    async put(key, value) { return gatewayClient.callMethod(targetId, 'put', [key, value]); },
    async remove(key) { return gatewayClient.callMethod(targetId, 'remove', [key]); },
    async containsKey(key) { return gatewayClient.callMethod(targetId, 'containsKey', [key]); },
    async containsValue(value) { return gatewayClient.callMethod(targetId, 'containsValue', [value]); },
    async clear() { return gatewayClient.callMethod(targetId, 'clear', []); },
    async keySet() { return gatewayClient.callMethod(targetId, 'keySet', []); },
    async values() { return gatewayClient.callMethod(targetId, 'values', []); },
    async entrySet() { return gatewayClient.callMethod(targetId, 'entrySet', []); },

    async toMap() {
      const result = new Map();
      const entries = await this.entrySet();
      for await (const entry of entries) {
        const key = await entry.getKey();
        const val = await entry.getValue();
        result.set(key, val);
      }
      return result;
    },

    async toObject() {
      const result = {};
      const keys = await this.keySet();
      for await (const key of keys) { result[key] = await this.get(key); }
      return result;
    },

    async call(method, ...args) { return gatewayClient.callMethod(targetId, method, args); },
  };

  return new Proxy(obj, {
    get(target, prop) {
      if (typeof prop === 'symbol') return target[prop];
      if (Object.prototype.hasOwnProperty.call(target, prop)) return target[prop];
      if (prop === 'then') return undefined;
      return (...args) => gatewayClient.callMethod(targetId, prop, args);
    },
  });
}

// ---------------------------------------------------------------------------
// JavaArray — wraps Java arrays (fixed length)
// ---------------------------------------------------------------------------

function createJavaArray(targetId, gatewayClient) {
  function arrayCmd(subCmd, ...parts) {
    let cmd = ARRAY_COMMAND_NAME + subCmd + targetId + END_COMMAND_PART;
    for (const p of parts) cmd += p;
    cmd += END + END_COMMAND_PART;
    return cmd;
  }

  const obj = {
    _targetId: targetId,
    _gatewayClient: gatewayClient,
    _isJavaArray: true,

    async get(index) {
      const answer = await gatewayClient._sendCommand(
        arrayCmd(ARRAY_GET_SUB_COMMAND_NAME, INTEGER_TYPE + index + END_COMMAND_PART)
      );
      return decodeReturnValue(answer, gatewayClient);
    },

    async set(index, value) {
      const answer = await gatewayClient._sendCommand(
        arrayCmd(ARRAY_SET_SUB_COMMAND_NAME,
          INTEGER_TYPE + index + END_COMMAND_PART,
          encodeCommandPart(value, gatewayClient._proxyPool))
      );
      return decodeReturnValue(answer, gatewayClient);
    },

    async length() {
      const answer = await gatewayClient._sendCommand(arrayCmd(ARRAY_LEN_SUB_COMMAND_NAME));
      return decodeReturnValue(answer, gatewayClient);
    },

    async slice(fromIndex, toIndex) {
      const answer = await gatewayClient._sendCommand(
        arrayCmd(ARRAY_SLICE_SUB_COMMAND_NAME,
          INTEGER_TYPE + fromIndex + END_COMMAND_PART,
          INTEGER_TYPE + toIndex + END_COMMAND_PART)
      );
      return decodeReturnValue(answer, gatewayClient);
    },

    async toArray() {
      const len = await this.length();
      const result = [];
      for (let i = 0; i < len; i++) { result.push(await this.get(i)); }
      return result;
    },

    async *[Symbol.asyncIterator]() {
      const len = await this.length();
      for (let i = 0; i < len; i++) { yield await this.get(i); }
    },

    async call(method, ...args) { return gatewayClient.callMethod(targetId, method, args); },
  };

  return obj;
}

// ---------------------------------------------------------------------------
// JavaIterator — wraps java.util.Iterator
// ---------------------------------------------------------------------------

function createJavaIterator(targetId, gatewayClient) {
  const obj = {
    _targetId: targetId,
    _gatewayClient: gatewayClient,
    _isJavaIterator: true,

    async hasNext() { return gatewayClient.callMethod(targetId, 'hasNext', []); },
    async next() { return gatewayClient.callMethod(targetId, 'next', []); },
    async remove() { return gatewayClient.callMethod(targetId, 'remove', []); },

    async *[Symbol.asyncIterator]() {
      while (await this.hasNext()) { yield await this.next(); }
    },

    async toArray() {
      const result = [];
      while (await this.hasNext()) { result.push(await this.next()); }
      return result;
    },

    async call(method, ...args) { return gatewayClient.callMethod(targetId, method, args); },
  };

  return new Proxy(obj, {
    get(target, prop) {
      if (typeof prop === 'symbol') return target[prop];
      if (Object.prototype.hasOwnProperty.call(target, prop)) return target[prop];
      if (prop === 'then') return undefined;
      return (...args) => gatewayClient.callMethod(targetId, prop, args);
    },
  });
}

module.exports = {
  createJavaList,
  createJavaSet,
  createJavaMap,
  createJavaArray,
  createJavaIterator,
};
