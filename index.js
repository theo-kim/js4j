'use strict';

/**
 * js4j — A Node.js implementation of py4j.
 *
 * Provides bidirectional JavaScript ↔ Java communication using the py4j
 * gateway protocol, so js4j clients are fully compatible with py4j's Java
 * GatewayServer.
 *
 * Quick start:
 *
 *   const { JavaGateway } = require('js4j');
 *
 *   const gateway = new JavaGateway({ port: 25333 });
 *   await gateway.connect();
 *
 *   const sb = await gateway.jvm.java.lang.StringBuilder('Hello');
 *   await sb.append(', World!');
 *   console.log(await sb.toString()); // "Hello, World!"
 *
 *   await gateway.close();
 */

const { JavaGateway, GatewayParameters, CallbackServerParameters, GatewayClient } = require('./src/gateway');
const { ClientServer } = require('./src/clientServer');
const { CallbackServer, ProxyPool, createJavaProxy } = require('./src/callbackServer');
const { JVMView, createJavaClass, createJavaPackage } = require('./src/jvmView');
const { createJavaObject } = require('./src/javaObject');
const {
  createJavaList,
  createJavaSet,
  createJavaMap,
  createJavaArray,
  createJavaIterator,
} = require('./src/collections');
const {
  Js4JError,
  Js4JJavaError,
  Js4JNetworkError,
  Js4JAuthenticationError,
} = require('./src/exceptions');
const protocol = require('./src/protocol');

module.exports = {
  // Main gateway classes
  JavaGateway,
  GatewayParameters,
  CallbackServerParameters,
  ClientServer,
  GatewayClient,

  // Callback / proxy support
  CallbackServer,
  ProxyPool,
  createJavaProxy,

  // JVM navigation
  JVMView,
  createJavaClass,
  createJavaPackage,

  // Java object wrappers
  createJavaObject,
  createJavaList,
  createJavaSet,
  createJavaMap,
  createJavaArray,
  createJavaIterator,

  // Exceptions
  Js4JError,
  Js4JJavaError,
  Js4JNetworkError,
  Js4JAuthenticationError,

  // Low-level protocol (for advanced use)
  protocol,
};
