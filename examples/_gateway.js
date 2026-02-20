'use strict';

/**
 * Shared helper used by all examples.
 *
 * Locates the py4j JAR, compiles TestEntryPoint.java if needed,
 * then launches the gateway and returns { gateway, kill }.
 *
 * Set PY4J_JAR=/path/to/py4j.jar if auto-detection fails.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { launchGateway } = require('../src/launcher');

const ROOT      = path.resolve(__dirname, '..');
const JAVA_DIR  = path.join(ROOT, 'java');
const BUILD_DIR = path.join(JAVA_DIR, 'build');

function findPy4jJar() {
  if (process.env.PY4J_JAR) return process.env.PY4J_JAR;

  // Common system install locations
  const fixed = [
    '/usr/share/py4j/py4j.jar',
    '/usr/local/share/py4j/py4j.jar',
  ];
  for (const p of fixed) {
    if (fs.existsSync(p)) return p;
  }

  // pip install py4j puts the JAR next to the Python package
  try {
    const site = execSync(
      'python3 -c "import py4j, os; print(os.path.dirname(py4j.__file__))"',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    const libDir = path.join(site, 'java', 'lib');
    if (fs.existsSync(libDir)) {
      const jar = fs.readdirSync(libDir).find(f => f.endsWith('.jar'));
      if (jar) return path.join(libDir, jar);
    }
  } catch (_) {}

  return null;
}

function buildIfNeeded(jar) {
  const cls = path.join(BUILD_DIR, 'TestEntryPoint.class');
  if (fs.existsSync(cls)) return; // already built

  console.log('Compiling TestEntryPoint.java...');
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  execSync(
    `javac -cp "${jar}" -d "${BUILD_DIR}" "${path.join(JAVA_DIR, 'TestEntryPoint.java')}"`,
    { stdio: 'inherit' }
  );
  console.log('Compiled.\n');
}

async function startTestGateway() {
  const jar = findPy4jJar();
  if (!jar) {
    throw new Error(
      'py4j JAR not found. Install py4j (pip install py4j) or set PY4J_JAR=/path/to/py4j.jar'
    );
  }

  buildIfNeeded(jar);

  return launchGateway({
    classpath: `${BUILD_DIR}${path.delimiter}${jar}`,
    mainClass: 'TestEntryPoint',
  });
}

module.exports = { startTestGateway };
