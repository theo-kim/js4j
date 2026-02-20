'use strict';

/**
 * ClientServer — bidirectional, pinned-thread communication model.
 *
 * In py4j, ClientServer ensures that callbacks from Java arrive on the
 * same thread that made the original call into Java, enabling recursive
 * Java → Python → Java call chains without deadlocks.
 *
 * In Node.js there is only one thread and the event loop handles
 * concurrency, so the pinning behaviour is not required.  This module
 * wraps JavaGateway + CallbackServer with the same API surface as
 * py4j's ClientServer for compatibility.
 *
 * Mirrors py4j's ClientServer class.
 */

const { JavaGateway, GatewayParameters, CallbackServerParameters } = require('./gateway');
const { createJavaProxy } = require('./callbackServer');

class ClientServer {
  /**
   * @param {GatewayParameters|object}        [javaParameters]
   * @param {CallbackServerParameters|object} [pythonParameters]
   */
  constructor(javaParameters, pythonParameters) {
    this._gateway = new JavaGateway(javaParameters, pythonParameters);
  }

  /**
   * Connect to the Java gateway AND start the callback server.
   * @returns {Promise<ClientServer>}
   */
  async connect() {
    await this._gateway.connect();
    await this._gateway.startCallbackServer();
    return this;
  }

  /**
   * Shut down the gateway and the callback server.
   */
  async shutdown() {
    await this._gateway.shutdown();
  }

  /** The jvm namespace (same as gateway.jvm). */
  get jvm() {
    return this._gateway.jvm;
  }

  /** The entry point object (same as gateway.entry_point). */
  get entry_point() {
    return this._gateway.entry_point;
  }

  /** The underlying JavaGateway. */
  get gateway() {
    return this._gateway;
  }

  /** The callback server. */
  get callbackServer() {
    return this._gateway._callbackServer;
  }

  // Delegate convenience methods
  getField(obj, name) { return this._gateway.getField(obj, name); }
  setField(obj, name, val) { return this._gateway.setField(obj, name, val); }
  newArray(cls, ...dims) { return this._gateway.newArray(cls, ...dims); }
  newJvmView(name) { return this._gateway.newJvmView(name); }
  getMethods(obj) { return this._gateway.getMethods(obj); }
  getFields(obj) { return this._gateway.getFields(obj); }
  getStaticMembers(cls) { return this._gateway.getStaticMembers(cls); }
  javaImport(fqn) { return this._gateway.javaImport(fqn); }
  help(target) { return this._gateway.help(target); }
  releaseObject(obj) { return this._gateway.releaseObject(obj); }
  detach(obj) { return this._gateway.detach(obj); }
}

module.exports = { ClientServer, createJavaProxy };
