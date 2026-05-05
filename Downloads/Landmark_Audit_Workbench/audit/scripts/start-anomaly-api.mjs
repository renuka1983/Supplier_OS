#!/usr/bin/env node
/**
 * Launches the FastAPI anomaly service from audit/backend.
 * Prefers backend/.venv when present; otherwise python3 on PATH.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, '..', 'backend');

function venvPython() {
  const isWin = process.platform === 'win32';
  const rel = isWin ? ['.venv', 'Scripts', 'python.exe'] : ['.venv', 'bin', 'python'];
  const p = path.join(backendDir, ...rel);
  return fs.existsSync(p) ? p : null;
}

function pickPython() {
  const v = venvPython();
  if (v) return v;
  if (process.env.PYTHON && fs.existsSync(process.env.PYTHON)) return process.env.PYTHON;
  return process.platform === 'win32' ? 'py' : 'python3';
}

const host = process.env.ANOMALY_API_HOST || '127.0.0.1';
const port = process.env.ANOMALY_API_PORT || '8000';
const healthPath = process.env.ANOMALY_API_HEALTH_PATH || '/v1/anomaly/health';
const py = pickPython();
const pyArgs =
  py === 'py'
    ? ['-3', '-m', 'uvicorn', 'app.main:app', '--host', host, '--port', port, '--reload']
    : ['-m', 'uvicorn', 'app.main:app', '--host', host, '--port', port, '--reload'];

if (!fs.existsSync(backendDir)) {
  console.error('start-anomaly-api: backend directory not found:', backendDir);
  process.exit(1);
}

function checkHealth() {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: host === '0.0.0.0' ? '127.0.0.1' : host,
        port: Number(port),
        path: healthPath,
        method: 'GET',
        timeout: 1200,
      },
      (res) => resolve(res.statusCode === 200),
    );
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

function attachToExistingApi() {
  console.log(`start-anomaly-api: reusing API already running on http://${host}:${port}`);
  const tick = setInterval(() => {}, 1 << 30);
  const stop = () => {
    clearInterval(tick);
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (await checkHealth()) {
  attachToExistingApi();
}

const child = spawn(py, pyArgs, {
  cwd: backendDir,
  stdio: 'inherit',
  env: { ...process.env },
});

child.on('error', (err) => {
  console.error('start-anomaly-api: failed to spawn Python (%s):', py, err.message);
  console.error('Create a venv in backend/:  python3 -m venv .venv && .venv/bin/pip install -r requirements.txt');
  process.exit(1);
});

child.on('exit', (code, signal) => {
  // Common case in local dev: another uvicorn/docker instance already bound.
  // If the health endpoint is reachable, treat it as success and keep web app alive.
  if (code === 1) {
    checkHealth().then((ok) => {
      if (ok) {
        attachToExistingApi();
      } else {
        process.exit(1);
      }
    });
    return;
  }
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
