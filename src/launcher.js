'use strict';

const { spawn, execSync } = require('child_process');
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
 * @param {boolean}  [options.killConflict=false] - If true, detect and kill any process already
 *                                                  listening on the target port before launching.
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
    killConflict = false,
  } = options;

  if (!classpath) throw new Error('launchGateway: options.classpath is required');
  if (!mainClass) throw new Error('launchGateway: options.mainClass is required');

  if (killConflict) {
    await _checkAndKillConflict(host, port);
  }

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

/**
 * If something is already listening on host:port, find its PID(s) and kill them,
 * then wait for the port to become free.
 */
async function _checkAndKillConflict(host, port) {
  const inUse = await _isPortInUse(host, port);
  if (!inUse) return;

  const pids = _getPidsOnPort(port);
  if (pids.length === 0) {
    throw new Error(
      `launchGateway: port ${port} is already in use but no owning process could be found. ` +
      `Free the port manually and retry.`
    );
  }

  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch (_) {
      // process may have already exited
    }
  }

  await _waitForPortFree(host, port, 5000);
}

/**
 * Return true if something is already accepting connections on host:port.
 */
function _isPortInUse(host, port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(500);
    sock.on('connect', () => { sock.destroy(); resolve(true); });
    sock.on('error',   () => { sock.destroy(); resolve(false); });
    sock.on('timeout', () => { sock.destroy(); resolve(false); });
    sock.connect(port, host);
  });
}

/**
 * Find the PID(s) of whatever is listening on the given port.
 * Uses lsof on Linux/macOS and netstat on Windows.
 * Returns an array of integer PIDs (may be empty if detection fails).
 */
function _getPidsOnPort(port) {
  try {
    if (process.platform === 'win32') {
      // netstat -ano lists active connections; parse LISTENING lines for the port
      const out = execSync(`netstat -ano`, { encoding: 'utf8', stdio: 'pipe' });
      const pids = new Set();
      for (const line of out.split('\n')) {
        // Format: "  TCP  0.0.0.0:25333  0.0.0.0:0  LISTENING  1234"
        if (!line.includes('LISTENING')) continue;
        if (!line.includes(`:${port}`)) continue;
        const parts = line.trim().split(/\s+/);
        const pid = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(pid) && pid > 0) pids.add(pid);
      }
      return [...pids];
    } else {
      // lsof -ti :<port> prints one PID per line
      const out = execSync(`lsof -ti :${port}`, { encoding: 'utf8', stdio: 'pipe' }).trim();
      return out
        .split('\n')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n > 0);
    }
  } catch (_) {
    // lsof/netstat not available, or returned non-zero (no matches)
    return [];
  }
}

/**
 * Poll until nothing is listening on host:port, or reject after timeout ms.
 */
function _waitForPortFree(host, port, timeout) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;
    function check() {
      if (Date.now() > deadline) {
        reject(new Error(
          `launchGateway: port ${port} was still occupied after ${timeout}ms`
        ));
        return;
      }
      const sock = new net.Socket();
      sock.setTimeout(300);
      sock.on('connect', () => { sock.destroy(); setTimeout(check, 200); });
      sock.on('error',   () => { sock.destroy(); resolve(); });
      sock.on('timeout', () => { sock.destroy(); resolve(); });
      sock.connect(port, host);
    }
    check();
  });
}

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
