#!/usr/bin/env node
'use strict';

/**
 * Comparison test runner.
 *
 * 1. Starts the Java TestEntryPoint gateway server
 * 2. Runs test_py4j.py (captures py4j results)
 * 3. Runs test_js4j.js (captures js4j results)
 * 4. Compares the two result sets and reports differences
 *
 * Prerequisites:
 *   - Java installed (java on PATH)
 *   - py4j Java JAR on CLASSPATH (or provide PY4J_JAR env var)
 *   - Python 3 with py4j installed: pip install py4j
 *   - TestEntryPoint.java compiled: javac -cp <py4j.jar> java/TestEntryPoint.java -d java/build
 *
 * Usage:
 *   node tests/comparison/run_comparison.js
 *   PY4J_JAR=/path/to/py4j.jar node tests/comparison/run_comparison.js
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');

const ROOT = path.resolve(__dirname, '../..');
const JAVA_DIR = path.join(ROOT, 'java');
const BUILD_DIR = path.join(JAVA_DIR, 'build');
const PY4J_JAR = process.env.PY4J_JAR || findPy4jJar();
const GATEWAY_PORT = parseInt(process.env.GATEWAY_PORT || '25333', 10);
const PY_RESULTS = path.join(__dirname, 'comparison_results_py4j.json');
const JS_RESULTS = path.join(__dirname, 'comparison_results_js4j.json');

// Numeric comparison tolerance
const FLOAT_TOLERANCE = 1e-9;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findPy4jJar() {
  // Try common locations
  const candidates = [
    '/usr/share/py4j/py4j.jar',
    '/usr/local/share/py4j/py4j.jar',
    // pip install py4j puts the jar here
    ...(() => {
      try {
        const site = execSync('python3 -c "import py4j; import os; print(os.path.dirname(py4j.__file__))"', {
          encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
        }).trim();
        return [
          path.join(site, 'java', 'lib', 'py4j0.10.9.9.jar'),
          path.join(site, 'java', 'lib', 'py4j0.10.9.8.jar'),
          path.join(site, 'java', 'lib', 'py4j0.10.9.7.jar'),
          ...fs.readdirSync(path.join(site, 'java', 'lib')).map(f => path.join(site, 'java', 'lib', f)),
        ].filter(f => f.endsWith('.jar'));
      } catch (_) {
        return [];
      }
    })(),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch (_) {}
  }
  return null;
}

function waitForPort(port, host, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function attempt() {
      const sock = new net.Socket();
      sock.setTimeout(500);
      sock.on('connect', () => { sock.destroy(); resolve(); });
      sock.on('error', () => {
        sock.destroy();
        if (Date.now() - start > timeout) {
          reject(new Error(`Timeout waiting for port ${port}`));
        } else {
          setTimeout(attempt, 300);
        }
      });
      sock.on('timeout', () => {
        sock.destroy();
        setTimeout(attempt, 300);
      });
      sock.connect(port, host);
    }
    attempt();
  });
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...opts });
    child.on('close', (code) => {
      if (code !== 0 && !opts.allowFailure) {
        reject(new Error(`${cmd} exited with code ${code}`));
      } else {
        resolve(code);
      }
    });
    child.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Build Java
// ---------------------------------------------------------------------------

async function buildJava() {
  if (!PY4J_JAR) {
    throw new Error(
      'py4j JAR not found. Set PY4J_JAR=/path/to/py4j.jar or install py4j: pip install py4j'
    );
  }
  console.log(`Using py4j JAR: ${PY4J_JAR}`);

  fs.mkdirSync(BUILD_DIR, { recursive: true });

  console.log('Compiling TestEntryPoint.java...');
  await run('javac', [
    '-cp', PY4J_JAR,
    '-d', BUILD_DIR,
    path.join(JAVA_DIR, 'TestEntryPoint.java'),
  ]);
  console.log('Compiled successfully.\n');
}

// ---------------------------------------------------------------------------
// Start gateway server
// ---------------------------------------------------------------------------

async function startGateway() {
  console.log(`Starting Java GatewayServer on port ${GATEWAY_PORT}...`);
  const child = spawn('java', [
    '-cp', `${BUILD_DIR}:${PY4J_JAR}`,
    'TestEntryPoint',
    String(GATEWAY_PORT),
  ], { stdio: ['pipe', 'pipe', 'inherit'] });

  // Wait for "GATEWAY_STARTED:" line
  await new Promise((resolve, reject) => {
    let buf = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      process.stdout.write(chunk);
      if (buf.includes('GATEWAY_STARTED:')) resolve();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`Gateway exited with code ${code}`));
    });
    setTimeout(() => reject(new Error('Timeout waiting for gateway')), 15000);
  });

  await waitForPort(GATEWAY_PORT, '127.0.0.1');
  console.log('Gateway is ready.\n');
  return child;
}

// ---------------------------------------------------------------------------
// Compare results
// ---------------------------------------------------------------------------

function floatEq(a, b) {
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) <= FLOAT_TOLERANCE * Math.max(1, Math.abs(a), Math.abs(b));
  }
  return false;
}

function valuesMatch(py, js) {
  if (py === null && js === null) return true;
  if (py === null || js === null) return false;
  if (typeof py === 'boolean' && typeof js === 'boolean') return py === js;
  if (typeof py === 'number' && typeof js === 'number') {
    return py === js || floatEq(py, js);
  }
  if (typeof py === 'string' && typeof js === 'string') return py === js;
  return String(py) === String(js);
}

function compareResults(pyResults, jsResults) {
  const allKeys = new Set([...Object.keys(pyResults), ...Object.keys(jsResults)]);
  let passed = 0, failed = 0, skipped = 0;

  console.log('\n' + '='.repeat(70));
  console.log('COMPARISON RESULTS');
  console.log('='.repeat(70));

  for (const key of [...allKeys].sort()) {
    const py = pyResults[key];
    const js = jsResults[key];

    if (!py) { console.log(`  SKIP   ${key}  (missing from py4j results)`); skipped++; continue; }
    if (!js) { console.log(`  SKIP   ${key}  (missing from js4j results)`); skipped++; continue; }

    const statusMatch = py.status === js.status;
    const valueMatch = statusMatch && valuesMatch(py.value, js.value);

    if (statusMatch && valueMatch) {
      console.log(`  PASS   ${key}  = ${JSON.stringify(py.value)}`);
      passed++;
    } else if (statusMatch && py.status !== 'ok') {
      // Both threw an error (type matches) — consider it a pass for exception tests
      console.log(`  PASS   ${key}  [both raised ${py.status}]`);
      passed++;
    } else {
      console.log(`  FAIL   ${key}`);
      console.log(`           py4j:  status=${py.status}  value=${JSON.stringify(py.value)}`);
      console.log(`           js4j:  status=${js.status}  value=${JSON.stringify(js.value)}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}  Total: ${allKeys.size}`);
  console.log('='.repeat(70) + '\n');

  return failed === 0;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  let gateway = null;

  try {
    await buildJava();
    gateway = await startGateway();

    // Run py4j tests
    console.log('Running py4j (Python) tests...\n');
    await run('python3', [
      path.join(__dirname, 'test_py4j.py'),
      '--gateway-port', String(GATEWAY_PORT),
      '--output', PY_RESULTS,
    ], { allowFailure: true });

    // Run js4j tests
    console.log('\nRunning js4j (Node.js) tests...\n');
    await run('node', [
      path.join(__dirname, 'test_js4j.js'),
      '--gateway-port', String(GATEWAY_PORT),
      '--output', JS_RESULTS,
    ], { allowFailure: true });

    // Compare
    if (!fs.existsSync(PY_RESULTS)) throw new Error(`py4j results file not found: ${PY_RESULTS}`);
    if (!fs.existsSync(JS_RESULTS)) throw new Error(`js4j results file not found: ${JS_RESULTS}`);

    const pyResults = JSON.parse(fs.readFileSync(PY_RESULTS, 'utf8'));
    const jsResults = JSON.parse(fs.readFileSync(JS_RESULTS, 'utf8'));

    const allPassed = compareResults(pyResults, jsResults);
    process.exitCode = allPassed ? 0 : 1;

  } catch (err) {
    console.error('\nComparison runner error:', err.message);
    process.exitCode = 1;
  } finally {
    if (gateway) {
      console.log('Shutting down gateway...');
      gateway.stdin.end();
      gateway.kill('SIGTERM');
    }
  }
}

main();
