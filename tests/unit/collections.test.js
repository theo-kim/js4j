'use strict';

const {
  createJavaList,
  createJavaSet,
  createJavaMap,
  createJavaArray,
  createJavaIterator,
} = require('../../src/collections');

// ---------------------------------------------------------------------------
// Mock gateway client
// ---------------------------------------------------------------------------

function makeMockClient(responses = {}) {
  return {
    async callMethod(targetId, methodName, args) {
      const key = `${targetId}.${methodName}`;
      if (key in responses) {
        const val = responses[key];
        return typeof val === 'function' ? val(args) : val;
      }
      throw new Error(`Mock: unexpected callMethod(${targetId}, ${methodName}, ${JSON.stringify(args)})`);
    },
    async getField(targetId, fieldName) {
      const key = `${targetId}.${fieldName}`;
      if (key in responses) return responses[key];
      throw new Error(`Mock: unexpected getField(${targetId}, ${fieldName})`);
    },
    async _sendCommand(cmd) { return 'yv'; },
    _wrapObject: (id) => ({ _targetId: id }),
    _lookupProxy: () => null,
    _proxyPool: null,
  };
}

// ---------------------------------------------------------------------------
// JavaList
// ---------------------------------------------------------------------------

describe('JavaList', () => {
  test('size() delegates to callMethod', async () => {
    const client = makeMockClient({ 'list1.size': 3 });
    const list = createJavaList('list1', client);
    expect(await list.size()).toBe(3);
  });

  test('get(index) delegates to callMethod', async () => {
    const client = makeMockClient({ 'list1.get': (args) => ['a', 'b', 'c'][args[0]] });
    const list = createJavaList('list1', client);
    expect(await list.get(0)).toBe('a');
    expect(await list.get(2)).toBe('c');
  });

  test('add(element) delegates to callMethod', async () => {
    const added = [];
    const client = makeMockClient({
      'list1.add': (args) => { added.push(args[0]); return true; },
    });
    const list = createJavaList('list1', client);
    await list.add('hello');
    expect(added).toEqual(['hello']);
  });

  test('clear() delegates to callMethod', async () => {
    let cleared = false;
    const client = makeMockClient({ 'list1.clear': () => { cleared = true; return null; } });
    const list = createJavaList('list1', client);
    await list.clear();
    expect(cleared).toBe(true);
  });

  test('contains() returns correct value', async () => {
    const client = makeMockClient({
      'list1.contains': (args) => args[0] === 'x',
    });
    const list = createJavaList('list1', client);
    expect(await list.contains('x')).toBe(true);
    expect(await list.contains('y')).toBe(false);
  });

  test('toArray() collects all elements', async () => {
    const data = ['a', 'b', 'c'];
    const client = makeMockClient({
      'list1.size': data.length,
      'list1.get': (args) => data[args[0]],
    });
    const list = createJavaList('list1', client);
    expect(await list.toArray()).toEqual(['a', 'b', 'c']);
  });

  test('async iterator yields elements in order', async () => {
    const data = [10, 20, 30];
    const client = makeMockClient({
      'list1.size': data.length,
      'list1.get': (args) => data[args[0]],
    });
    const list = createJavaList('list1', client);
    const collected = [];
    for await (const item of list) {
      collected.push(item);
    }
    expect(collected).toEqual([10, 20, 30]);
  });

  test('_targetId is accessible', () => {
    const list = createJavaList('myListId', makeMockClient());
    expect(list._targetId).toBe('myListId');
  });
});

// ---------------------------------------------------------------------------
// JavaSet
// ---------------------------------------------------------------------------

describe('JavaSet', () => {
  test('size() delegates to callMethod', async () => {
    const client = makeMockClient({ 'set1.size': 2 });
    const set = createJavaSet('set1', client);
    expect(await set.size()).toBe(2);
  });

  test('contains() returns correct value', async () => {
    const client = makeMockClient({
      'set1.contains': (args) => args[0] === 'present',
    });
    const set = createJavaSet('set1', client);
    expect(await set.contains('present')).toBe(true);
    expect(await set.contains('absent')).toBe(false);
  });

  test('add() delegates to callMethod', async () => {
    const added = [];
    const client = makeMockClient({
      'set1.add': (args) => { added.push(args[0]); return true; },
    });
    const set = createJavaSet('set1', client);
    await set.add('newItem');
    expect(added).toContain('newItem');
  });

  test('_isJavaSet flag is set', () => {
    const set = createJavaSet('s1', makeMockClient());
    expect(set._isJavaSet).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// JavaMap
// ---------------------------------------------------------------------------

describe('JavaMap', () => {
  test('size() delegates to callMethod', async () => {
    const client = makeMockClient({ 'map1.size': 3 });
    const map = createJavaMap('map1', client);
    expect(await map.size()).toBe(3);
  });

  test('get(key) returns value', async () => {
    const store = { a: 1, b: 2 };
    const client = makeMockClient({
      'map1.get': (args) => store[args[0]] ?? null,
    });
    const map = createJavaMap('map1', client);
    expect(await map.get('a')).toBe(1);
    expect(await map.get('b')).toBe(2);
    expect(await map.get('z')).toBeNull();
  });

  test('put(key, value) delegates to callMethod', async () => {
    const puts = [];
    const client = makeMockClient({
      'map1.put': (args) => { puts.push(args); return null; },
    });
    const map = createJavaMap('map1', client);
    await map.put('key', 42);
    expect(puts[0]).toEqual(['key', 42]);
  });

  test('containsKey() returns correct value', async () => {
    const client = makeMockClient({
      'map1.containsKey': (args) => args[0] === 'existing',
    });
    const map = createJavaMap('map1', client);
    expect(await map.containsKey('existing')).toBe(true);
    expect(await map.containsKey('missing')).toBe(false);
  });

  test('_isJavaMap flag is set', () => {
    const map = createJavaMap('m1', makeMockClient());
    expect(map._isJavaMap).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// JavaArray
// ---------------------------------------------------------------------------

// JavaArray now uses _sendCommand with the ARRAY protocol (a\n) rather than
// callMethod. The mock client must intercept _sendCommand and return a
// properly-encoded response line.
describe('JavaArray', () => {
  const { ARRAY_COMMAND_NAME, ARRAY_GET_SUB_COMMAND_NAME, ARRAY_LEN_SUB_COMMAND_NAME } =
    require('../../src/protocol');

  function makeArrayClient(responses) {
    // responses: array of { test: (cmd) => bool, answer: string }
    return {
      async _sendCommand(cmd) {
        for (const { test, answer } of responses) {
          if (test(cmd)) return answer;
        }
        return 'yv'; // default void
      },
      _wrapObject: (id) => ({ _targetId: id }),
      _lookupProxy: () => null,
      _proxyPool: null,
      // callMethod still needed for the `call()` passthrough
      async callMethod(targetId, method, args) { return null; },
    };
  }

  test('get(index) uses ARRAY GET sub-command', async () => {
    const GET_PREFIX = ARRAY_COMMAND_NAME + ARRAY_GET_SUB_COMMAND_NAME;
    const client = makeArrayClient([
      { test: (cmd) => cmd.includes(GET_PREFIX), answer: 'yi200' },
    ]);
    const arr = createJavaArray('arr1', client);
    expect(await arr.get(1)).toBe(200);
  });

  test('length() uses ARRAY LEN sub-command', async () => {
    const LEN_PREFIX = ARRAY_COMMAND_NAME + ARRAY_LEN_SUB_COMMAND_NAME;
    const client = makeArrayClient([
      { test: (cmd) => cmd.includes(LEN_PREFIX), answer: 'yi5' },
    ]);
    const arr = createJavaArray('arr1', client);
    expect(await arr.length()).toBe(5);
  });

  test('toArray() collects all elements via get()', async () => {
    const data = [10, 20, 30];
    // Match the FULL prefix (ARRAY_COMMAND_NAME + sub-command) to avoid false
    // positives: ARRAY_LEN_SUB_COMMAND_NAME = 'e\n' also appears as the END
    // marker at the tail of every command string.
    const LEN_PREFIX = ARRAY_COMMAND_NAME + ARRAY_LEN_SUB_COMMAND_NAME; // 'a\ne\n'
    const GET_PREFIX = ARRAY_COMMAND_NAME + ARRAY_GET_SUB_COMMAND_NAME; // 'a\ng\n'
    let calls = 0;
    const client = makeMockClient();
    client._sendCommand = async (cmd) => {
      if (cmd.includes(LEN_PREFIX)) return `yi${data.length}`;
      if (cmd.includes(GET_PREFIX)) return `yi${data[calls++]}`;
      return 'yv';
    };
    const arr = createJavaArray('arr1', client);
    expect(await arr.toArray()).toEqual([10, 20, 30]);
  });

  test('_isJavaArray flag is set', () => {
    expect(createJavaArray('a1', makeMockClient())._isJavaArray).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// JavaIterator
// ---------------------------------------------------------------------------

describe('JavaIterator', () => {
  test('iterates via hasNext/next', async () => {
    const items = ['x', 'y', 'z'];
    let idx = 0;
    const client = makeMockClient({
      'iter1.hasNext': () => idx < items.length,
      'iter1.next': () => items[idx++],
    });
    const iter = createJavaIterator('iter1', client);
    const collected = [];
    while (await iter.hasNext()) {
      collected.push(await iter.next());
    }
    expect(collected).toEqual(['x', 'y', 'z']);
  });

  test('async iterator protocol works', async () => {
    const items = [1, 2, 3];
    let idx = 0;
    const client = makeMockClient({
      'iter1.hasNext': () => idx < items.length,
      'iter1.next': () => items[idx++],
    });
    const iter = createJavaIterator('iter1', client);
    const collected = [];
    for await (const item of iter) {
      collected.push(item);
    }
    expect(collected).toEqual([1, 2, 3]);
  });

  test('toArray() returns all remaining elements', async () => {
    const items = ['a', 'b'];
    let idx = 0;
    const client = makeMockClient({
      'iter1.hasNext': () => idx < items.length,
      'iter1.next': () => items[idx++],
    });
    const iter = createJavaIterator('iter1', client);
    expect(await iter.toArray()).toEqual(['a', 'b']);
  });

  test('_isJavaIterator flag is set', () => {
    expect(createJavaIterator('i1', makeMockClient())._isJavaIterator).toBe(true);
  });
});
