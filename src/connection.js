'use strict';

const net = require('net');
const { Js4JNetworkError, Js4JAuthenticationError } = require('./exceptions');
const {
  AUTH_COMMAND_NAME,
  END,
  END_COMMAND_PART,
  SUCCESS,
} = require('./protocol');

/**
 * Serialises concurrent requests so that only one in-flight command exists on
 * the socket at a time — matching py4j's synchronous request/response model.
 */
class RequestQueue {
  constructor() {
    this._queue = [];
    this._running = false;
  }

  /** Enqueue an async task function and return its result as a Promise. */
  run(task) {
    return new Promise((resolve, reject) => {
      this._queue.push({ task, resolve, reject });
      this._flush();
    });
  }

  async _flush() {
    if (this._running) return;
    this._running = true;
    while (this._queue.length > 0) {
      const { task, resolve, reject } = this._queue.shift();
      try {
        resolve(await task());
      } catch (err) {
        reject(err);
      }
    }
    this._running = false;
  }
}

/**
 * A single TCP connection to a py4j-compatible GatewayServer.
 *
 * Handles buffered line-by-line reading and serialises commands through a
 * RequestQueue so the socket is never used concurrently.
 */
class GatewayConnection {
  constructor(options = {}) {
    this.host = options.host || '127.0.0.1';
    this.port = options.port || 25333;
    this.authToken = options.authToken || null;
    this._socket = null;
    this._buffer = '';
    this._readResolve = null;
    this._readReject = null;
    this._queue = new RequestQueue();
    this._closed = false;
  }

  /** Open the TCP connection (and optionally authenticate). */
  connect() {
    return new Promise((resolve, reject) => {
      const sock = new net.Socket();
      sock.setEncoding('utf8');
      sock.setNoDelay(true);

      sock.on('data', (chunk) => {
        this._buffer += chunk;
        this._drainBuffer();
      });

      sock.on('error', (err) => {
        this._closed = true;
        if (this._readReject) {
          this._readReject(new Js4JNetworkError('Socket error: ' + err.message));
          this._readReject = null;
          this._readResolve = null;
        }
      });

      sock.on('close', () => {
        this._closed = true;
        if (this._readReject) {
          this._readReject(new Js4JNetworkError('Connection closed by remote host'));
          this._readReject = null;
          this._readResolve = null;
        }
      });

      sock.connect(this.port, this.host, async () => {
        this._socket = sock;
        try {
          if (this.authToken) {
            await this._authenticate();
          }
          resolve(this);
        } catch (err) {
          sock.destroy();
          reject(err);
        }
      });

      sock.on('error', (err) => {
        if (!this._socket) {
          // Connection-phase error
          reject(new Js4JNetworkError('Could not connect to gateway: ' + err.message));
        }
      });
    });
  }

  /** Send an authentication command and verify the response. */
  async _authenticate() {
    const cmd = AUTH_COMMAND_NAME + this.authToken + END_COMMAND_PART + END + END_COMMAND_PART;
    const resp = await this._rawSend(cmd);
    if (!resp.startsWith(SUCCESS)) {
      throw new Js4JAuthenticationError('Gateway authentication failed');
    }
  }

  /**
   * Send a py4j command string and return the single-line response.
   * Requests are queued; only one is in flight at a time.
   */
  sendCommand(command) {
    if (this._closed) {
      return Promise.reject(new Js4JNetworkError('Connection is closed'));
    }
    return this._queue.run(() => this._rawSend(command));
  }

  /** Internal: write to socket and wait for one line of response. */
  _rawSend(command) {
    return new Promise((resolve, reject) => {
      this._readResolve = resolve;
      this._readReject = reject;
      this._socket.write(command, 'utf8', (err) => {
        if (err) {
          this._readResolve = null;
          this._readReject = null;
          reject(new Js4JNetworkError('Write failed: ' + err.message));
        }
      });
    });
  }

  /** Drain the internal buffer, resolving the pending read on a complete line. */
  _drainBuffer() {
    const idx = this._buffer.indexOf('\n');
    if (idx !== -1 && this._readResolve) {
      const line = this._buffer.substring(0, idx);
      this._buffer = this._buffer.substring(idx + 1);
      const resolve = this._readResolve;
      this._readResolve = null;
      this._readReject = null;
      resolve(line);
    }
  }

  /** Close this connection. */
  close() {
    this._closed = true;
    if (this._socket) {
      this._socket.destroy();
      this._socket = null;
    }
  }

  get isConnected() {
    return !this._closed && this._socket !== null;
  }
}

/**
 * A pool of GatewayConnections.
 * py4j gives each thread its own connection; in Node.js we hand out
 * connections from the pool (creating new ones as needed) and return them
 * when the request is done.
 *
 * For simplicity the default pool size is 1 (sequential behaviour matching
 * py4j's single-threaded usage), but you can raise maxConnections for
 * concurrent callers.
 */
class ConnectionPool {
  constructor(options = {}, maxConnections = 4) {
    this._options = options;
    this._maxConnections = maxConnections;
    this._idle = []; // available connections
    this._active = 0;
    this._waiters = [];
  }

  /** Borrow a connection from the pool (creates one if needed). */
  async acquire() {
    if (this._idle.length > 0) {
      const conn = this._idle.pop();
      if (conn.isConnected) {
        this._active++;
        return conn;
      }
    }

    if (this._active < this._maxConnections) {
      const conn = new GatewayConnection(this._options);
      await conn.connect();
      this._active++;
      return conn;
    }

    // Wait for a connection to become available
    return new Promise((resolve, reject) => {
      this._waiters.push({ resolve, reject });
    });
  }

  /** Return a connection to the pool. */
  release(conn) {
    this._active--;
    if (this._waiters.length > 0) {
      const { resolve } = this._waiters.shift();
      this._active++;
      resolve(conn);
      return;
    }
    if (conn.isConnected) {
      this._idle.push(conn);
    }
  }

  /** Run a function with a borrowed connection, then release it. */
  async withConnection(fn) {
    const conn = await this.acquire();
    try {
      return await fn(conn);
    } finally {
      this.release(conn);
    }
  }

  /** Close all connections in the pool. */
  closeAll() {
    for (const conn of this._idle) {
      conn.close();
    }
    this._idle = [];
  }
}

module.exports = { GatewayConnection, ConnectionPool, RequestQueue };
