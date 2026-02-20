'use strict';

/**
 * Base error class for all js4j errors.
 * Mirrors py4j's Py4JError.
 */
class Js4JError extends Error {
  constructor(message) {
    super(message);
    this.name = 'Js4JError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Raised when a Java-side exception occurs during method invocation.
 * Contains the full Java exception message and optional stack trace.
 * Mirrors py4j's Py4JJavaError.
 */
class Js4JJavaError extends Js4JError {
  /**
   * @param {string} message             - Human-readable error message
   * @param {string} javaExceptionMessage - Raw protocol payload (e.g. "ro0")
   * @param {object} [javaException]     - Decoded Java Throwable as a JavaObject;
   *                                       call await err.javaException.getMessage() etc.
   */
  constructor(message, javaExceptionMessage, javaException) {
    super(message);
    this.name = 'Js4JJavaError';
    this.javaExceptionMessage = javaExceptionMessage || '';
    this.javaException = javaException || null;
  }

  toString() {
    return `${this.name}: ${this.message}\n  Java exception payload: ${this.javaExceptionMessage}`;
  }
}

/**
 * Raised when a network error occurs during communication with the Java gateway.
 * Mirrors py4j's Py4JNetworkError.
 */
class Js4JNetworkError extends Js4JError {
  constructor(message) {
    super(message);
    this.name = 'Js4JNetworkError';
  }
}

/**
 * Raised when authentication with the Java gateway fails.
 * Mirrors py4j's Py4JAuthenticationError.
 */
class Js4JAuthenticationError extends Js4JError {
  constructor(message) {
    super(message || 'Authentication failed');
    this.name = 'Js4JAuthenticationError';
  }
}

module.exports = {
  Js4JError,
  Js4JJavaError,
  Js4JNetworkError,
  Js4JAuthenticationError,
};
