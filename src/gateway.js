'use strict';

const { ConnectionPool, GatewayConnection } = require('./connection');
const { JVMView } = require('./jvmView');
const { createJavaObject, gatewayMethods } = require('./javaObject');
const { CallbackServer, ProxyPool } = require('./callbackServer');
const {
  SHUTDOWN_GATEWAY_COMMAND_NAME,
  ENTRY_POINT_OBJECT_ID,
  END,
  END_COMMAND_PART,
  decodeReturnValue,
  ARRAY_COMMAND_NAME,
  ARRAY_CREATE_SUB_COMMAND_NAME,
  JVMVIEW_COMMAND_NAME,
  JVMVIEW_IMPORT_SUB_COMMAND_NAME,
  encodeCommandPart,
  STRING_TYPE,
} = require('./protocol');
const { Js4JError, Js4JNetworkError } = require('./exceptions');

// ---------------------------------------------------------------------------
// GatewayParameters — mirrors py4j's GatewayParameters
// ---------------------------------------------------------------------------

class GatewayParameters {
  constructor(options = {}) {
    this.host = options.host || '127.0.0.1';
    this.port = options.port || 25333;
    this.authToken = options.authToken || null;
    this.autoField = options.autoField || false;
    this.autoConvert = options.autoConvert || false;
    this.enableMemoryManagement = options.enableMemoryManagement || false;
    this.poolSize = options.poolSize || 4;
  }
}

// ---------------------------------------------------------------------------
// CallbackServerParameters — mirrors py4j's CallbackServerParameters
// ---------------------------------------------------------------------------

class CallbackServerParameters {
  constructor(options = {}) {
    this.host = options.host || '127.0.0.1';
    this.port = options.port || 25334;
    this.daemonize = options.daemonize !== undefined ? options.daemonize : true;
    this.propagateException = options.propagateException || false;
  }
}

// ---------------------------------------------------------------------------
// GatewayClient — internal client that actually talks to the GatewayServer
// ---------------------------------------------------------------------------

class GatewayClient {
  constructor(gatewayParameters, proxyPool) {
    this._params = gatewayParameters;
    this._proxyPool = proxyPool || new ProxyPool();
    this._pool = new ConnectionPool(
      {
        host: gatewayParameters.host,
        port: gatewayParameters.port,
        authToken: gatewayParameters.authToken,
      },
      gatewayParameters.poolSize
    );
  }

  async _sendCommand(command) {
    return this._pool.withConnection((conn) => conn.sendCommand(command));
  }

  async shutdownGateway() {
    const cmd = SHUTDOWN_GATEWAY_COMMAND_NAME + END + END_COMMAND_PART;
    try {
      await this._sendCommand(cmd);
    } catch (_) {}
  }

  closeAll() {
    this._pool.closeAll();
  }
}

Object.assign(GatewayClient.prototype, gatewayMethods);

// ---------------------------------------------------------------------------
// JavaGateway — main entry point (mirrors py4j's JavaGateway)
// ---------------------------------------------------------------------------

class JavaGateway {
  constructor(gatewayParameters, callbackServerParameters) {
    this._gatewayParams =
      gatewayParameters instanceof GatewayParameters
        ? gatewayParameters
        : new GatewayParameters(gatewayParameters || {});

    this._callbackParams =
      callbackServerParameters instanceof CallbackServerParameters
        ? callbackServerParameters
        : new CallbackServerParameters(callbackServerParameters || {});

    this._proxyPool = new ProxyPool();
    this._client = new GatewayClient(this._gatewayParams, this._proxyPool);
    this._callbackServer = null;
    this._connected = false;

    this.jvm = null;
    this.entry_point = null;
  }

  async connect() {
    await this._client._pool.withConnection(async () => {});
    this._connected = true;
    this.jvm = new JVMView(this._client);
    this.entry_point = createJavaObject(ENTRY_POINT_OBJECT_ID, this._client);
    return this;
  }

  async startCallbackServer() {
    if (this._callbackServer && this._callbackServer.listening) {
      return this._callbackServer;
    }
    this._callbackServer = new CallbackServer({
      host: this._callbackParams.host,
      port: this._callbackParams.port,
      proxyPool: this._proxyPool,
      gatewayClient: this._client,
    });
    await this._callbackServer.start();
    return this._callbackServer;
  }

  async shutdownCallbackServer() {
    if (this._callbackServer) {
      await this._callbackServer.stop();
      this._callbackServer = null;
    }
  }

  async close() {
    await this.shutdownCallbackServer();
    this._client.closeAll();
    this._connected = false;
  }

  async shutdown() {
    try { await this._client.shutdownGateway(); } catch (_) {}
    await this.close();
  }

  async getField(javaObject, fieldName) {
    return this._client.getField(javaObject, fieldName);
  }

  async setField(javaObject, fieldName, value) {
    return this._client.setField(javaObject, fieldName, value);
  }

  async newArray(javaClass, ...dimensions) {
    if (dimensions.length === 0) {
      throw new Js4JError('newArray requires at least one dimension');
    }
    const classFqn = (javaClass && (javaClass._fqn || javaClass._targetId)) || String(javaClass);
    let command =
      ARRAY_COMMAND_NAME +
      ARRAY_CREATE_SUB_COMMAND_NAME +
      STRING_TYPE + classFqn + END_COMMAND_PART;
    for (const dim of dimensions) {
      command += encodeCommandPart(dim, this._proxyPool);
    }
    command += END + END_COMMAND_PART;
    const answer = await this._client._sendCommand(command);
    return decodeReturnValue(answer, this._client);
  }

  async newJvmView(name = 'custom jvm') {
    const command =
      JVMVIEW_COMMAND_NAME +
      JVMVIEW_IMPORT_SUB_COMMAND_NAME +
      name + END_COMMAND_PART +
      END + END_COMMAND_PART;
    await this._client._sendCommand(command);
    return new (require('./jvmView').JVMView)(this._client);
  }

  async getMethods(javaObject) { return this._client.getMethods(javaObject); }
  async getFields(javaObject) { return this._client.getFields(javaObject); }

  async isInstanceOf(javaObject, javaClass) {
    const classFqn =
      typeof javaClass === 'string' ? javaClass : javaClass._fqn || javaClass._targetId;
    return this._client.callMethod(javaObject._targetId, 'getClass().isAssignableFrom', [classFqn]);
  }

  async javaImport(classFqn) { return this.jvm.javaImport(classFqn); }

  async help(target) {
    if (typeof target === 'string') return this.jvm.help(target);
    return this._client.help(target);
  }

  async releaseObject(javaObject) {
    const targetId = typeof javaObject === 'string' ? javaObject : javaObject._targetId;
    return this._client.releaseObject(targetId);
  }

  async detach(javaObject) { return this.releaseObject(javaObject); }

  async getStaticMembers(javaClass) { return this._client.getStaticMembers(javaClass); }

  get connected() { return this._connected; }
  get gatewayParameters() { return this._gatewayParams; }
  get callbackServerParameters() { return this._callbackParams; }
}

module.exports = {
  JavaGateway,
  GatewayParameters,
  CallbackServerParameters,
  GatewayClient,
};
