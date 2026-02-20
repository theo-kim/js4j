// Type definitions for js4j
// A Node.js implementation of py4j — bridge between JavaScript and Java

// ---------------------------------------------------------------------------
// Opaque Java object types
// ---------------------------------------------------------------------------

/**
 * A reference to a Java object instance living in the JVM.
 * Property access returns async functions that invoke Java methods.
 *
 * @example
 * const sb = await gateway.jvm.java.lang.StringBuilder('hello');
 * await sb.append(' world');
 * const str = await sb.toString(); // 'hello world'
 */
export interface JavaObject {
  readonly _targetId: string;
  readonly _gatewayClient: GatewayClient;
  /** Call any Java method by name. */
  [key: string]: any;
}

/**
 * A reference to a Java class (for static access and constructors).
 *
 * @example
 * const Math = gateway.jvm.java.lang.Math;
 * const pi = await gateway.getField(Math, 'PI');
 * const abs = await Math.abs(-42);
 */
export interface JavaClass {
  readonly _fqn: string;
  readonly _targetId: string;
  readonly _isJavaClass: true;
  /** Invoke the constructor. */
  (...args: any[]): Promise<JavaObject>;
  /** Access static methods. */
  [key: string]: any;
}

/**
 * A Java package namespace. Traverse to a class via property access.
 *
 * @example
 * const pkg = gateway.jvm.java.util; // JavaPackage
 * const cls = gateway.jvm.java.util.ArrayList; // JavaClass
 */
export interface JavaPackage {
  readonly _fqn: string;
  readonly _isJavaPackage: true;
  [name: string]: any;
}

/** A wrapped java.util.List. */
export interface JavaList extends JavaObject {
  readonly _isJavaList: true;
  size(): Promise<number>;
  get(index: number): Promise<any>;
  add(element: any): Promise<boolean>;
  addAt(index: number, element: any): Promise<void>;
  remove(indexOrValue: number | any): Promise<any>;
  set(index: number, element: any): Promise<any>;
  clear(): Promise<void>;
  contains(value: any): Promise<boolean>;
  indexOf(value: any): Promise<number>;
  subList(fromIndex: number, toIndex: number): Promise<JavaList>;
  sort(): Promise<void>;
  reverse(): Promise<void>;
  count(value: any): Promise<number>;
  toArray(): Promise<any[]>;
  [Symbol.asyncIterator](): AsyncIterableIterator<any>;
}

/** A wrapped java.util.Set. */
export interface JavaSet extends JavaObject {
  readonly _isJavaSet: true;
  size(): Promise<number>;
  add(element: any): Promise<boolean>;
  remove(element: any): Promise<boolean>;
  contains(element: any): Promise<boolean>;
  clear(): Promise<void>;
  toArray(): Promise<any[]>;
  toSet(): Promise<Set<any>>;
  [Symbol.asyncIterator](): AsyncIterableIterator<any>;
}

/** A wrapped java.util.Map. */
export interface JavaMap extends JavaObject {
  readonly _isJavaMap: true;
  size(): Promise<number>;
  get(key: any): Promise<any>;
  put(key: any, value: any): Promise<any>;
  remove(key: any): Promise<any>;
  containsKey(key: any): Promise<boolean>;
  containsValue(value: any): Promise<boolean>;
  clear(): Promise<void>;
  keySet(): Promise<JavaSet>;
  values(): Promise<JavaObject>;
  entrySet(): Promise<JavaSet>;
  toMap(): Promise<Map<any, any>>;
  toObject(): Promise<Record<string, any>>;
}

/** A wrapped Java array. */
export interface JavaArray extends JavaObject {
  readonly _isJavaArray: true;
  get(index: number): Promise<any>;
  set(index: number, value: any): Promise<void>;
  length(): Promise<number>;
  slice(fromIndex: number, toIndex: number): Promise<JavaArray>;
  toArray(): Promise<any[]>;
  [Symbol.asyncIterator](): AsyncIterableIterator<any>;
}

/** A wrapped java.util.Iterator. */
export interface JavaIterator extends JavaObject {
  readonly _isJavaIterator: true;
  hasNext(): Promise<boolean>;
  next(): Promise<any>;
  remove(): Promise<void>;
  toArray(): Promise<any[]>;
  [Symbol.asyncIterator](): AsyncIterableIterator<any>;
}

// ---------------------------------------------------------------------------
// JVMView
// ---------------------------------------------------------------------------

/**
 * The root of the `gateway.jvm` namespace. Provides access to Java classes
 * via package traversal and manages shortcut imports.
 *
 * @example
 * const jvm = gateway.jvm;
 * const sb = await jvm.java.lang.StringBuilder('hello');
 * await gateway.javaImport('java.util.LinkedList');
 * const ll = await jvm.LinkedList();
 */
export declare class JVMView {
  constructor(gatewayClient: GatewayClient, id?: string);
  /** Import a class FQN as a shortcut (e.g. 'java.util.ArrayList'). */
  javaImport(fqn: string): Promise<void>;
  /** Remove a previously imported shortcut. */
  removeImport(fqn: string): Promise<void>;
  /** Get a JavaClass by FQN without traversal. */
  getClass(classFqn: string): JavaClass;
  /** Get help text for a Java class. */
  help(classFqn: string): Promise<string>;
  /** Package / class traversal. */
  [name: string]: any;
}

// ---------------------------------------------------------------------------
// Gateway configuration
// ---------------------------------------------------------------------------

export interface GatewayParametersOptions {
  host?: string;
  port?: number;
  authToken?: string | null;
  autoField?: boolean;
  autoConvert?: boolean;
  enableMemoryManagement?: boolean;
  poolSize?: number;
}

export declare class GatewayParameters {
  host: string;
  port: number;
  authToken: string | null;
  autoField: boolean;
  autoConvert: boolean;
  enableMemoryManagement: boolean;
  poolSize: number;
  constructor(options?: GatewayParametersOptions);
}

export interface CallbackServerParametersOptions {
  host?: string;
  port?: number;
  daemonize?: boolean;
  propagateException?: boolean;
}

export declare class CallbackServerParameters {
  host: string;
  port: number;
  daemonize: boolean;
  propagateException: boolean;
  constructor(options?: CallbackServerParametersOptions);
}

// ---------------------------------------------------------------------------
// GatewayClient (low-level)
// ---------------------------------------------------------------------------

export declare class GatewayClient {
  constructor(gatewayParameters: GatewayParameters, proxyPool?: ProxyPool);
  callMethod(targetId: string, methodName: string, args: any[]): Promise<any>;
  callConstructor(classFqn: string, args: any[]): Promise<JavaObject>;
  getField(targetOrId: JavaObject | JavaClass | string, fieldName: string): Promise<any>;
  setField(targetOrId: JavaObject | JavaClass | string, fieldName: string, value: any): Promise<void>;
  releaseObject(targetId: string): Promise<void>;
  getMethods(targetOrId: JavaObject | string): Promise<string[]>;
  getFields(targetOrId: JavaObject | string): Promise<string[]>;
  getStaticMembers(classOrId: JavaClass | string): Promise<string[]>;
  help(targetOrId: JavaObject | string, pattern?: string): Promise<string>;
  _sendCommand(command: string): Promise<string>;
  _wrapObject(targetId: string, typeHint: string): JavaObject | JavaList | JavaSet | JavaMap | JavaArray | JavaIterator;
}

// ---------------------------------------------------------------------------
// JavaGateway — main entry point
// ---------------------------------------------------------------------------

export declare class JavaGateway {
  /** The jvm namespace — access Java classes as gateway.jvm.java.lang.String */
  jvm: JVMView;
  /** The entry point object set on the Java GatewayServer. */
  entry_point: JavaObject;

  constructor(
    gatewayParameters?: GatewayParameters | GatewayParametersOptions,
    callbackServerParameters?: CallbackServerParameters | CallbackServerParametersOptions
  );

  /** Connect to the Java GatewayServer. Must be called before any operations. */
  connect(): Promise<this>;

  /** Start the callback server so Java can invoke methods on JS proxy objects. */
  startCallbackServer(): Promise<CallbackServer>;

  /** Stop the callback server. */
  shutdownCallbackServer(): Promise<void>;

  /** Close all connections to the Java gateway. */
  close(): Promise<void>;

  /** Send a shutdown command to the remote GatewayServer, then close. */
  shutdown(): Promise<void>;

  /** Get the value of a field on a Java object or class. */
  getField(javaObject: JavaObject | JavaClass | string, fieldName: string): Promise<any>;

  /** Set the value of a field on a Java object. */
  setField(javaObject: JavaObject | string, fieldName: string, value: any): Promise<void>;

  /** Create a new Java array. */
  newArray(javaClass: JavaClass | string, ...dimensions: number[]): Promise<JavaArray>;

  /** Create a new named JVMView with its own import namespace. */
  newJvmView(name?: string): Promise<JVMView>;

  /** List the public methods available on a Java object. */
  getMethods(javaObject: JavaObject | string): Promise<string[]>;

  /** List the public fields available on a Java object. */
  getFields(javaObject: JavaObject | string): Promise<string[]>;

  /** List the public static members of a Java class. */
  getStaticMembers(javaClass: JavaClass | string): Promise<string[]>;

  /** Import a Java class into the jvm namespace as a shortcut. */
  javaImport(classFqn: string): Promise<void>;

  /** Get help text for a Java object or class. */
  help(target: JavaObject | JavaClass | string): Promise<string>;

  /** Release a Java object reference (garbage collection notification). */
  releaseObject(javaObject: JavaObject | string): Promise<void>;

  /** Alias for releaseObject(). */
  detach(javaObject: JavaObject | string): Promise<void>;

  readonly connected: boolean;
  readonly gatewayParameters: GatewayParameters;
  readonly callbackServerParameters: CallbackServerParameters;
}

// ---------------------------------------------------------------------------
// ClientServer
// ---------------------------------------------------------------------------

/**
 * Bidirectional communication wrapper combining JavaGateway + CallbackServer.
 * Mirrors py4j's ClientServer.
 *
 * @example
 * const cs = new ClientServer({ port: 25333 }, { port: 25334 });
 * await cs.connect();
 * const result = await cs.jvm.java.lang.Math.abs(-5);
 * await cs.shutdown();
 */
export declare class ClientServer {
  constructor(
    javaParameters?: GatewayParameters | GatewayParametersOptions,
    pythonParameters?: CallbackServerParameters | CallbackServerParametersOptions
  );
  connect(): Promise<this>;
  shutdown(): Promise<void>;
  readonly jvm: JVMView;
  readonly entry_point: JavaObject;
  readonly gateway: JavaGateway;
  readonly callbackServer: CallbackServer | null;
  getField(obj: JavaObject | JavaClass | string, name: string): Promise<any>;
  setField(obj: JavaObject | string, name: string, val: any): Promise<void>;
  newArray(cls: JavaClass | string, ...dims: number[]): Promise<JavaArray>;
  newJvmView(name?: string): Promise<JVMView>;
  getMethods(obj: JavaObject | string): Promise<string[]>;
  getFields(obj: JavaObject | string): Promise<string[]>;
  getStaticMembers(cls: JavaClass | string): Promise<string[]>;
  javaImport(fqn: string): Promise<void>;
  help(target: JavaObject | JavaClass | string): Promise<string>;
  releaseObject(obj: JavaObject | string): Promise<void>;
  detach(obj: JavaObject | string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Callback / proxy support
// ---------------------------------------------------------------------------

/**
 * A pool of JS objects exposed to Java as callback proxies.
 */
export declare class ProxyPool {
  register(obj: object): string;
  get(id: string): object | null;
  remove(id: string): void;
  has(id: string): boolean;
}

/**
 * A JS object tagged for use as a Java interface implementation.
 */
export interface JavaProxy {
  readonly _js4jProxy: true;
  readonly _interfaces: string[];
  [method: string]: any;
}

/**
 * Create a JS object that can be passed to Java as a callback proxy.
 *
 * @param interfaces - Java interface FQNs this object implements
 * @param impl - Object with method implementations
 *
 * @example
 * const runnable = createJavaProxy(['java.lang.Runnable'], {
 *   run() { console.log('Java called run!'); return null; }
 * });
 * const thread = await gateway.jvm.java.lang.Thread(runnable);
 * await thread.start();
 */
export declare function createJavaProxy(
  interfaces: string[],
  impl: Record<string, (...args: any[]) => any>
): JavaProxy;

export declare class CallbackServer {
  host: string;
  port: number;
  listening: boolean;
  constructor(options?: {
    host?: string;
    port?: number;
    proxyPool?: ProxyPool;
    gatewayClient?: GatewayClient;
  });
  start(): Promise<this>;
  stop(): Promise<void>;
  readonly proxyPool: ProxyPool;
}

// ---------------------------------------------------------------------------
// Launcher
// ---------------------------------------------------------------------------

import { ChildProcess } from 'child_process';

export interface LaunchGatewayOptions {
  /** Java classpath (e.g. '/path/to/py4j.jar:.') */
  classpath: string;
  /** Fully-qualified main class to launch (e.g. 'com.example.MyApp') */
  mainClass: string;
  /** Gateway host. Default: '127.0.0.1' */
  host?: string;
  /** Gateway port. Default: 25333 */
  port?: number;
  /** Extra JVM flags (e.g. ['-Xmx512m']). Default: [] */
  jvmArgs?: string[];
  /** Extra arguments passed to the main class. Default: [] */
  args?: string[];
  /**
   * Pattern to match in process stdout that signals the server is ready.
   * Set to null to skip stdout checking and rely only on port polling.
   * Default: /GATEWAY_STARTED/
   */
  readyPattern?: RegExp | string | null;
  /** Maximum milliseconds to wait for the server to become ready. Default: 30000 */
  timeout?: number;
  /** Extra options forwarded to GatewayParameters. */
  gatewayOptions?: GatewayParametersOptions;
  /**
   * If true, detect any process already listening on the target port and send
   * it SIGTERM before launching. An error is thrown if the port cannot be
   * freed within 5 seconds. Default: false.
   */
  killConflict?: boolean;
}

export interface LaunchGatewayResult {
  /** The spawned Java child process. */
  process: ChildProcess;
  /** A connected JavaGateway instance. */
  gateway: JavaGateway;
  /**
   * Shut down the gateway and kill the Java process.
   * Equivalent to calling `gateway.shutdown()` then `process.kill()`.
   */
  kill: () => Promise<void>;
}

/**
 * Spawn a Java GatewayServer process and connect a JavaGateway to it.
 *
 * @example
 * const { gateway, kill } = await launchGateway({
 *   classpath: '/usr/share/py4j/py4j.jar:java/build',
 *   mainClass: 'com.example.MyApp',
 * });
 * const result = await gateway.entry_point.doSomething();
 * await kill();
 */
export declare function launchGateway(options: LaunchGatewayOptions): Promise<LaunchGatewayResult>;

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

export declare function createJavaClass(fqn: string, gatewayClient: GatewayClient): JavaClass;
export declare function createJavaPackage(fqn: string, gatewayClient: GatewayClient): JavaPackage;
export declare function createJavaObject(targetId: string, gatewayClient: GatewayClient): JavaObject;
export declare function createJavaList(targetId: string, gatewayClient: GatewayClient): JavaList;
export declare function createJavaSet(targetId: string, gatewayClient: GatewayClient): JavaSet;
export declare function createJavaMap(targetId: string, gatewayClient: GatewayClient): JavaMap;
export declare function createJavaArray(targetId: string, gatewayClient: GatewayClient): JavaArray;
export declare function createJavaIterator(targetId: string, gatewayClient: GatewayClient): JavaIterator;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export declare class Js4JError extends Error {
  constructor(message: string);
}

export declare class Js4JJavaError extends Js4JError {
  /** Raw protocol error payload (e.g. "ro0"). */
  javaExceptionMessage: string;
  /** Decoded Java Throwable as a JavaObject (call getMessage(), etc.). */
  javaException: JavaObject | null;
  constructor(message: string, javaExceptionMessage: string, javaException?: JavaObject | null);
}

export declare class Js4JNetworkError extends Js4JError {
  constructor(message: string);
}

export declare class Js4JAuthenticationError extends Js4JError {
  constructor(message?: string);
}

// ---------------------------------------------------------------------------
// Protocol (low-level, for advanced use)
// ---------------------------------------------------------------------------

export declare namespace protocol {
  const CALL_COMMAND_NAME: string;
  const CONSTRUCTOR_COMMAND_NAME: string;
  const FIELD_COMMAND_NAME: string;
  const JVMVIEW_COMMAND_NAME: string;
  const REFLECTION_COMMAND_NAME: string;
  const MEMORY_COMMAND_NAME: string;
  const ARRAY_COMMAND_NAME: string;
  const DIR_COMMAND_NAME: string;
  const HELP_COMMAND_NAME: string;
  const SHUTDOWN_GATEWAY_COMMAND_NAME: string;

  const REFERENCE_TYPE: string;
  const INTEGER_TYPE: string;
  const LONG_TYPE: string;
  const DOUBLE_TYPE: string;
  const BOOLEAN_TYPE: string;
  const STRING_TYPE: string;
  const NULL_TYPE: string;
  const VOID_TYPE: string;
  const LIST_TYPE: string;
  const SET_TYPE: string;
  const MAP_TYPE: string;
  const ARRAY_TYPE: string;
  const ITERATOR_TYPE: string;

  const SUCCESS: string;
  const ERROR: string;
  const RETURN_MESSAGE: string;
  const END: string;
  const END_COMMAND_PART: string;
  const ENTRY_POINT_OBJECT_ID: string;
  const STATIC_PREFIX: string;
  const DEFAULT_JVM_ID: string;

  function encodeCommandPart(value: any, proxyPool?: ProxyPool): string;
  function decodeReturnValue(answer: string, gatewayClient: GatewayClient): any;
  function escapeNewLines(s: string): string;
  function unescapeNewLines(s: string): string;
}
