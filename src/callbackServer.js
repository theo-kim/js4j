'use strict';

const net = require('net');
const { EventEmitter } = require('events');
const { Js4JNetworkError, Js4JError } = require('./exceptions');
const {
  CALL_COMMAND_NAME,
  SUCCESS,
  ERROR,
  END,
  END_COMMAND_PART,
  NULL_TYPE,
  VOID_TYPE,
  encodeCommandPart,
  decodeReturnValue,
  decodeTypedValue,
} = require('./protocol');

/**
 * A pool of JS objects that are exposed to Java as "Python proxies".
 * When a JS object is passed as an argument to a Java method, and that
 * Java method expects a Java interface, we register the JS object here.
 * Java can then call methods on it via the CallbackServer.
 *
 * Mirrors py4j's PythonProxyPool.
 */
class ProxyPool extends EventEmitter {
  constructor() {
    super();
    this._pool = new Map();
    this._counter = 0;
  }

  /** Register a JS proxy object and return its ID. */
  register(obj) {
    const id = 'p' + this._counter++;
    this._pool.set(id, obj);
    return id;
  }

  /** Look up a proxy by ID. */
  get(id) {
    return this._pool.get(id) || null;
  }

  /** Remove a proxy from the pool. */
  remove(id) {
    this._pool.delete(id);
  }

  /** Check if a proxy is registered. */
  has(id) {
    return this._pool.has(id);
  }
}

/**
 * Handles a single callback connection from Java.
 * Reads py4j-protocol commands and dispatches them to JS proxy objects.
 */
class CallbackConnection {
  constructor(socket, proxyPool, gatewayClient) {
    this._socket = socket;
    this._proxyPool = proxyPool;
    this._gatewayClient = gatewayClient;
    this._buffer = '';

    socket.setEncoding('utf8');
    socket.setNoDelay(true);

    socket.on('data', (chunk) => {
      this._buffer += chunk;
      this._processBuffer();
    });

    socket.on('error', () => {});
    socket.on('close', () => {});
  }

  _processBuffer() {
    // Commands are newline-delimited sequences ending with "e\n"
    // Read lines until we have a full command
    const lines = [];
    let remaining = this._buffer;

    while (true) {
      const idx = remaining.indexOf('\n');
      if (idx === -1) break;
      const line = remaining.substring(0, idx);
      remaining = remaining.substring(idx + 1);
      lines.push(line);
      if (line === END) {
        this._buffer = remaining;
        this._handleCommand(lines);
        return;
      }
    }
    this._buffer = remaining;
  }

  async _handleCommand(lines) {
    if (lines.length === 0) return;

    const commandType = lines[0];

    if (commandType === 'c') {
      // Call command: c, proxy_id, method_name, [args...], e
      const proxyId = lines[1];
      const methodName = lines[2];
      const argLines = lines.slice(3, lines.length - 1); // exclude trailing 'e'

      const proxy = this._proxyPool.get(proxyId);
      if (!proxy) {
        this._sendError(`No proxy found with id: ${proxyId}`);
        return;
      }

      const method = proxy[methodName];
      if (typeof method !== 'function') {
        this._sendError(`Method '${methodName}' not found on proxy`);
        return;
      }

      try {
        const args = this._decodeArgs(argLines);
        const result = await method.apply(proxy, args);
        this._sendSuccess(result);
      } catch (err) {
        this._sendError(err.message || String(err));
      }
    } else if (commandType === 'g') {
      // Garbage-collect a proxy
      const proxyId = lines[1];
      this._proxyPool.remove(proxyId);
      this._sendSuccessVoid();
    }
  }

  _decodeArgs(argLines) {
    const args = [];
    for (const line of argLines) {
      if (line.length === 0) continue;
      const typePrefix = line[0];
      const value = line.slice(1);
      args.push(decodeTypedValue(typePrefix, value, this._gatewayClient));
    }
    return args;
  }

  _sendSuccess(value) {
    let response;
    if (value === null || value === undefined) {
      response = '!' + SUCCESS + VOID_TYPE + '\n';
    } else {
      try {
        const encoded = encodeCommandPart(value, this._proxyPool);
        // encodeCommandPart returns "type+value\n"; wrap in return+success code
        response = '!' + SUCCESS + encoded;
      } catch (_) {
        response = '!' + SUCCESS + VOID_TYPE + '\n';
      }
    }
    this._socket.write(response);
  }

  _sendSuccessVoid() {
    this._socket.write('!' + SUCCESS + VOID_TYPE + '\n');
  }

  _sendError(message) {
    this._socket.write('!' + ERROR + message + '\n');
  }
}

/**
 * CallbackServer — listens for Java → JS callback connections.
 *
 * When a JS object is passed to Java as a proxy (implementing a Java
 * interface), Java connects back here to invoke methods on that object.
 *
 * Mirrors py4j's CallbackServer.
 */
class CallbackServer extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} [options.host='127.0.0.1']
   * @param {number} [options.port=25334]
   * @param {ProxyPool} options.proxyPool
   * @param {object} options.gatewayClient
   */
  constructor(options = {}) {
    super();
    this.host = options.host || '127.0.0.1';
    this.port = options.port || 25334;
    this._proxyPool = options.proxyPool || new ProxyPool();
    this._gatewayClient = options.gatewayClient;
    this._server = null;
    this._connections = new Set();
    this.listening = false;
  }

  /** Start listening for Java callback connections. */
  start() {
    return new Promise((resolve, reject) => {
      this._server = net.createServer((socket) => {
        const conn = new CallbackConnection(socket, this._proxyPool, this._gatewayClient);
        this._connections.add(conn);
        socket.on('close', () => this._connections.delete(conn));
        this.emit('connection', conn);
      });

      this._server.on('error', reject);

      this._server.listen(this.port, this.host, () => {
        this.listening = true;
        this.port = this._server.address().port; // capture actual port (useful if port=0)
        this.emit('listening');
        resolve(this);
      });
    });
  }

  /** Stop the callback server and close all connections. */
  stop() {
    return new Promise((resolve) => {
      for (const conn of this._connections) {
        try { conn._socket.destroy(); } catch (_) {}
      }
      this._connections.clear();

      if (this._server) {
        this._server.close(() => {
          this.listening = false;
          resolve();
        });
        this._server = null;
      } else {
        resolve();
      }
    });
  }

  get proxyPool() {
    return this._proxyPool;
  }
}

/**
 * Helper to create a JS object that can be passed to Java as a callback proxy.
 *
 * @param {string[]} interfaces - Java interface FQNs this object implements
 * @param {object} impl - Object with method implementations
 * @returns {object} A proxy-tagged object ready to pass to Java
 *
 * @example
 * const handler = createJavaProxy(
 *   ['java.lang.Runnable'],
 *   { run: () => console.log('Java called run!') }
 * );
 * await gateway.jvm.java.lang.Thread(handler).start();
 */
function createJavaProxy(interfaces, impl) {
  return Object.assign({}, impl, {
    _js4jProxy: true,
    _interfaces: interfaces,
  });
}

module.exports = { CallbackServer, ProxyPool, CallbackConnection, createJavaProxy };
