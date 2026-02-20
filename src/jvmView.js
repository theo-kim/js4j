'use strict';

const {
  JVMVIEW_COMMAND_NAME,
  JVMVIEW_CLASS_SUB_COMMAND_NAME,
  JVMVIEW_IMPORT_SUB_COMMAND_NAME,
  JVMVIEW_REMOVE_IMPORT_SUB_COMMAND_NAME,
  HELP_COMMAND_NAME,
  HELP_CLASS_SUBCOMMAND_NAME,
  END,
  END_COMMAND_PART,
  STATIC_PREFIX,
  DEFAULT_JVM_ID,
  decodeReturnValue,
  encodeCommandPart,
} = require('./protocol');

/**
 * Create a JavaClass proxy for a fully-qualified class name.
 *
 * The returned object behaves as:
 *   - A callable that invokes the Java constructor when awaited:
 *       const sb = await gateway.jvm.java.lang.StringBuilder('hello');
 *   - A source of static method accessors:
 *       const val = await gateway.jvm.java.lang.System.currentTimeMillis();
 *   - A source of static field accessors via gateway.getField(JavaClass, 'FIELD')
 *
 * Mirrors py4j's JavaClass.
 */
function createJavaClass(fqn, gatewayClient) {
  // Use a function as the Proxy target so the proxy is callable
  const base = function JavaClass() {};
  base._fqn = fqn;
  // py4j uses a "z:" prefix for static method/field calls so Java knows to
  // dispatch statically rather than looking up a registered object instance.
  base._targetId = STATIC_PREFIX + fqn;
  base._gatewayClient = gatewayClient;
  base._isJavaClass = true;

  const handler = {
    // Property access → static method/field accessor
    get(target, prop) {
      if (typeof prop === 'symbol') return target[prop];
      // Only pass through OWN properties (e.g. _fqn, _targetId, _isJavaClass).
      // Inherited Function prototype methods (valueOf, toString, call, apply, …)
      // must NOT shadow Java static members with the same name.
      if (Object.prototype.hasOwnProperty.call(target, prop)) return target[prop];
      if (prop === 'then') return undefined; // not a Promise

      // Return an async function that calls a static method.
      // Java's CallCommand recognises the "z:" prefix and dispatches
      // the call statically on the named class.
      return (...args) => gatewayClient.callMethod(STATIC_PREFIX + fqn, prop, args);
    },

    // Called when the JavaClass proxy itself is invoked as a function → constructor
    apply(target, thisArg, args) {
      return gatewayClient.callConstructor(fqn, args);
    },

    // Support `new JavaClass(...)` as well
    construct(target, args) {
      return gatewayClient.callConstructor(fqn, args);
    },
  };

  return new Proxy(base, handler);
}

/**
 * Create a JavaPackage proxy for a partial FQN (e.g. "java", "java.lang").
 *
 * Attribute traversal accumulates the package path until it looks like a
 * class name (starts with an uppercase letter) or the value is used
 * as a constructor/method target, at which point a JavaClass is returned.
 *
 * Mirrors py4j's JavaPackage.
 */
function createJavaPackage(fqn, gatewayClient) {
  const base = function JavaPackage() {
    throw new Error(
      `'${fqn}' looks like a package, not a class. ` +
      `Traverse to a class first, e.g. gateway.jvm.java.lang.String`
    );
  };
  base._fqn = fqn;
  base._isJavaPackage = true;

  const handler = {
    get(target, prop) {
      if (typeof prop === 'symbol') return target[prop];
      if (prop in target) return target[prop];
      if (prop === 'then') return undefined; // not a Promise

      const childFqn = fqn ? `${fqn}.${prop}` : prop;

      // Heuristic: uppercase first char → probably a class
      if (prop[0] === prop[0].toUpperCase() && prop[0] !== prop[0].toLowerCase()) {
        return createJavaClass(childFqn, gatewayClient);
      }
      // Otherwise, keep building the package chain
      return createJavaPackage(childFqn, gatewayClient);
    },

    apply() {
      throw new Error(`'${fqn}' is a Java package, not a class.`);
    },
  };

  return new Proxy(base, handler);
}

/**
 * JVMView — the root of the jvm.* namespace.
 *
 * Mirrors py4j's JVMView.  Provides:
 *   gateway.jvm.java.lang.String(...)          → constructor
 *   gateway.jvm.java.lang.System.out           → static field (via getField)
 *   gateway.jvm.java.util.ArrayList            → JavaClass
 *   await gateway.jvmImport('java.util.*')     → shortcut imports (client-side)
 */
class JVMView {
  constructor(gatewayClient, id) {
    this._gatewayClient = gatewayClient;
    this._imports = new Map(); // shortName → fqn
    // JVM view ID used in JVMVIEW protocol commands. Default is "rj" (py4j DEFAULT_JVM_ID).
    this._id = id || DEFAULT_JVM_ID;

    // Return a Proxy over this instance so that `jvm.java` works
    return new Proxy(this, {
      get(target, prop) {
        if (typeof prop === 'symbol') return target[prop];
        if (prop in target) return target[prop];
        if (prop === 'then') return undefined;

        // Check shortcut imports first
        if (target._imports.has(prop)) {
          const fqn = target._imports.get(prop);
          return createJavaClass(fqn, target._gatewayClient);
        }

        // Start building a package/class chain
        if (prop[0] === prop[0].toUpperCase() && prop[0] !== prop[0].toLowerCase()) {
          return createJavaClass(prop, target._gatewayClient);
        }
        return createJavaPackage(prop, target._gatewayClient);
      },
    });
  }

  /**
   * Import a Java class or package into the JVM namespace, creating a shortcut.
   * Mirrors py4j's `java_import(gateway.jvm, 'java.util.ArrayList')`.
   * @param {string} fqn - Fully-qualified class name (wildcards supported for packages)
   * @returns {Promise<void>}
   */
  async javaImport(fqn) {
    const command =
      JVMVIEW_COMMAND_NAME +
      JVMVIEW_IMPORT_SUB_COMMAND_NAME +
      this._id + END_COMMAND_PART +
      fqn + END_COMMAND_PART +
      END + END_COMMAND_PART;
    const answer = await this._gatewayClient._sendCommand(command);
    const result = decodeReturnValue(answer, this._gatewayClient);

    // Register the simple name as a shortcut
    const parts = fqn.split('.');
    const simpleName = parts[parts.length - 1];
    if (simpleName !== '*') {
      this._imports.set(simpleName, fqn);
    }
    return result;
  }

  /**
   * Remove a previously imported class from this JVMView's shortcut namespace.
   * Mirrors py4j's remove_imports().
   * @param {string} fqn - Fully-qualified class name to remove
   * @returns {Promise<void>}
   */
  async removeImport(fqn) {
    const command =
      JVMVIEW_COMMAND_NAME +
      JVMVIEW_REMOVE_IMPORT_SUB_COMMAND_NAME +
      this._id + END_COMMAND_PART +
      fqn + END_COMMAND_PART +
      END + END_COMMAND_PART;
    await this._gatewayClient._sendCommand(command);

    // Remove from local shortcut map
    const parts = fqn.split('.');
    const simpleName = parts[parts.length - 1];
    if (simpleName !== '*') {
      this._imports.delete(simpleName);
    }
  }

  /**
   * Look up a class by FQN in the gateway's JVM.
   * @param {string} classFqn
   * @returns {JavaClass}
   */
  getClass(classFqn) {
    return createJavaClass(classFqn, this._gatewayClient);
  }

  /**
   * Get help string for a Java class.
   * @param {string} classFqn
   * @returns {Promise<string>}
   */
  async help(classFqn) {
    const command =
      HELP_COMMAND_NAME +
      HELP_CLASS_SUBCOMMAND_NAME +
      classFqn + END_COMMAND_PART +
      END + END_COMMAND_PART;
    const answer = await this._gatewayClient._sendCommand(command);
    return decodeReturnValue(answer, this._gatewayClient);
  }
}

module.exports = { JVMView, createJavaClass, createJavaPackage };
