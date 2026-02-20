'use strict';

const { spawn } = require('child_process');
const net = require('net');
const { JavaGateway, GatewayParameters } = require('./gateway');

/**
 * Launch a Java GatewayServer process and connect a JavaGateway to it.
 *
 * @param {object} options
 * @param {string}   options.classpath          - Java classpath (e.g. '/path/to/py4j.jar:.')
 * @param {string}   options.mainClass          - Fully-qualified main class (e.g. 'com.example.App')
 * @param {string}   [options.host='127.0.0.1'] - Gateway host
 * @param {number}   [options.port=25333]       - Gateway port
 * @param {string[]} [options.jvmArgs=[]]       - Extra JVM flags (e.g. ['-Xmx512m'])
 * @param {string[]} [options.args=[]]          - Extra arguments passed to the main class
 * @param {RegExp|string} [options.readyPattern=/GATEWAY_STARTED/] - Pattern to match in process stdout
 *                                                                   that signals the server is ready.
 *                                                                   Set to null to skip stdout check
 *                                                                   and rely only on port polling.
 * @param {number}   [options.timeout=30000]    - Max ms to wait for the server to be ready
 * @param {object}   [options.gatewayOptions]   - Extra options forwarded to GatewayParameters
 *
 * @returns {Promise<{ process: ChildProcess, gateway: JavaGateway, kill: Function }>}
 *
 * @example
 * const { launchGateway } = require('js4j');
 *
 * const { gateway, kill } = await launchGateway({
 *   classpath: '/usr/share/py4j/py4j.jar:java/build',
 *   mainClass: 'com.example.MyApp',
 * });
 *
 * const result = await gateway.entry_point.doSomething();
 * console.log(result);
 *
 * await kill();
 */
async function launchGateway(options = {}) {
  const {
    classpath,
    mainClass,
    host = '127.0.0.1',
    port = 25333,
    jvmArgs = [],
    args = [],
    readyPattern = /GATEWAY_STARTED/,
    timeout = 30000,
    gatewayOptions = {},
  } = options;

  if (!classpath) throw new Error('launchGateway: options.classpath is required');
  if (!mainClass) throw new Error('launchGateway: options.mainClass is required');

  // Build the java command: java [jvmArgs] -cp <classpath> <mainClass> [args]
  const javaArgs = [...jvmArgs, '-cp', classpath, mainClass, ...args];

  const child = spawn('java', javaArgs, {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Forward stderr to process.stderr so errors are visible
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));

  // Wait for the ready signal
  await _waitForReady(child, host, port, readyPattern, timeout);

  // Connect the gateway
  const gateway = new JavaGateway(
    new GatewayParameters({ host, port, ...gatewayOptions })
  );
  await gateway.connect();

  async function kill() {
    try { await gateway.shutdown(); } catch (_) {}
    child.kill('SIGTERM');
  }

  return { process: child, gateway, kill };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _waitForReady(child, host, port, readyPattern, timeout) {
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      reject(new Error(`launchGateway: timed out after ${timeout}ms waiting for the Java gateway to start`));
    }, timeout);

    let stdoutBuf = '';
    let patternMatched = !readyPattern; // skip if no pattern requested

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      if (patternMatched) return;
      stdoutBuf += chunk;
      const re = readyPattern instanceof RegExp ? readyPattern : new RegExp(readyPattern);
      if (re.test(stdoutBuf)) {
        patternMatched = true;
        _pollPort(host, port, deadline).then(resolve, reject);
      }
    });

    child.on('error', (err) => {
      clearTimeout(deadline);
      reject(new Error(`launchGateway: failed to spawn java process: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        clearTimeout(deadline);
        reject(new Error(`launchGateway: java process exited with code ${code}`));
      }
    });

    // If no readyPattern, go straight to polling
    if (patternMatched) {
      _pollPort(host, port, deadline).then(resolve, reject);
    }
  });
}

function _pollPort(host, port, deadline) {
  return new Promise((resolve, reject) => {
    function attempt() {
      const sock = new net.Socket();
      sock.setTimeout(500);
      sock.on('connect', () => {
        sock.destroy();
        clearTimeout(deadline);
        resolve();
      });
      sock.on('error', () => {
        sock.destroy();
        setTimeout(attempt, 200);
      });
      sock.on('timeout', () => {
        sock.destroy();
        setTimeout(attempt, 200);
      });
      sock.connect(port, host);
    }
    attempt();
  });
}

module.exports = { launchGateway };
