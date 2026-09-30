import { json } from '@sveltejs/kit';
import { spawn, exec, execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

// Preserve worker state across Vite HMR module reloads in development
const G = globalThis;
if (!G.__WORKER_STATE__) {
  G.__WORKER_STATE__ = {
    /** @type {import('node:child_process').ChildProcess | null} */
    workerProcess: null,
    recentLogs: [],
    intentionalStop: false,
    autoRestartBackoff: 1000,
    restartTimer: null,
    _stabilityTimer: null,
    consecutiveCrashes: 0
  };
}
const state = G.__WORKER_STATE__;
const MAX_LOGS = 1000;
const MAX_RESTART_BACKOFF = 30000; // max 30s between restarts

function addWorkerLog(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return;
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const l = line.trim();
    if (!l) continue;
    state.recentLogs.push({ ts: new Date().toLocaleTimeString(), text: l });
  }
  if (state.recentLogs.length > MAX_LOGS) {
    state.recentLogs = state.recentLogs.slice(-MAX_LOGS);
  }
}

function getPythonBinary() {
  const rootDir = process.cwd();
  const venvPaths = [
    path.resolve(rootDir, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
    path.resolve(rootDir, '_python_worker_ref', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
    path.resolve(rootDir, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  ];
  for (const venvPy of venvPaths) {
    if (fs.existsSync(venvPy)) {
      return venvPy;
    }
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

function getWorkerCwd() {
  return path.resolve(process.cwd(), '_python_worker_ref');
}

/** Check if any worker.py / worker.main processes are running externally on the system */
function getAllExternalWorkerPids() {
  try {
    if (process.platform === 'win32') {
      const out = execSync('wmic process where "commandline like \'%worker.py%\' and not name=\'wmic.exe\'" get processid', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      const pids = out.match(/\b\d+\b/g);
      return (pids || []).map(p => parseInt(p, 10)).filter(p => !isNaN(p));
    } else {
      const out = execSync("pgrep -f '(worker\\.py|worker\\.main)'", { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      const pids = out.trim().split(/\s+/).map(p => parseInt(p, 10)).filter(p => !isNaN(p) && p !== process.pid);
      return pids;
    }
  } catch {
    return [];
  }
}

function getExternalWorkerPid() {
  const pids = getAllExternalWorkerPids();
  return pids.length ? pids[0] : null;
}

function getActiveWorkerInfo() {
  if (state.workerProcess !== null && state.workerProcess.exitCode === null && !state.workerProcess.killed) {
    try {
      process.kill(state.workerProcess.pid, 0);
      return { running: true, pid: state.workerProcess.pid, external: false };
    } catch {
      state.workerProcess = null;
    }
  }
  const extPid = getExternalWorkerPid();
  if (extPid) {
    try {
      process.kill(extPid, 0);
      return { running: true, pid: extPid, external: true };
    } catch {}
  }
  return { running: false, pid: null, external: false };
}

function isWorkerRunning() {
  return getActiveWorkerInfo().running;
}

function stopWorkerProcess() {
  // Mark as intentional so auto-restart doesn't kick in
  state.intentionalStop = true;
  if (state.restartTimer) {
    clearTimeout(state.restartTimer);
    state.restartTimer = null;
  }
  if (state._stabilityTimer) {
    clearTimeout(state._stabilityTimer);
    state._stabilityTimer = null;
  }
  state.consecutiveCrashes = 0;
  state.autoRestartBackoff = 1000;

  // Terminate ALL external worker processes found
  const extPids = getAllExternalWorkerPids();
  for (const extPid of extPids) {
    try {
      if (process.platform === 'win32') {
        exec(`taskkill /pid ${extPid} /T /F`, () => {});
      } else {
        process.kill(extPid, 'SIGKILL');
      }
    } catch {}
  }

  return new Promise((resolve) => {
    if (!state.workerProcess) {
      resolve(true);
      return;
    }
    const proc = state.workerProcess;
    state.workerProcess = null;
    try {
      if (process.platform === 'win32' && proc.pid) {
        exec(`taskkill /pid ${proc.pid} /T /F`, () => resolve(true));
      } else {
        proc.kill('SIGKILL');
        resolve(true);
      }
    } catch {
      resolve(true);
    }
  });
}

/**
 * Schedule an auto-restart after the worker crashes unexpectedly.
 * Uses exponential backoff to avoid thrashing.
 */
function scheduleAutoRestart() {
  if (state.intentionalStop) return;
  if (isWorkerRunning()) return;
  if (state.restartTimer) return;

  state.consecutiveCrashes++;
  const delay = Math.min(state.autoRestartBackoff, MAX_RESTART_BACKOFF);
  state.autoRestartBackoff = Math.min(state.autoRestartBackoff * 2, MAX_RESTART_BACKOFF);

  addWorkerLog(`🔄 Worker crashed (attempt #${state.consecutiveCrashes}). Auto-restarting in ${(delay / 1000).toFixed(1)}s...`);

  state.restartTimer = setTimeout(async () => {
    state.restartTimer = null;
    if (state.intentionalStop || isWorkerRunning()) return;
    addWorkerLog(`🔄 Auto-restarting worker now...`);
    await startWorkerProcess();
  }, delay);
}

async function startWorkerProcess() {
  if (process.env.VERCEL) {
    return {
      ok: false,
      running: false,
      error: 'Vercel serverless environment detected. The Python Telegram worker must run on your local machine or a VPS where Python and Telethon are installed.'
    };
  }

  const active = getActiveWorkerInfo();
  if (active.running) {
    return { ok: true, running: true, pid: active.pid, message: `Worker is already running (PID: ${active.pid})` };
  }

  // Clear any pending restart timer
  if (state.restartTimer) {
    clearTimeout(state.restartTimer);
    state.restartTimer = null;
  }

  // Clear intentional stop flag — we're starting fresh
  state.intentionalStop = false;

  const cwd = getWorkerCwd();
  const pythonBin = getPythonBinary();
  addWorkerLog(`🚀 Starting Python Telegram Worker (worker.py)...`);

  try {
    const child = spawn(pythonBin, ['-u', 'worker.py'], {
      cwd,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    state.workerProcess = child;

    child.stdout?.on('data', (data) => {
      addWorkerLog(data.toString());
    });

    child.stderr?.on('data', (data) => {
      addWorkerLog(`[stderr] ${data.toString()}`);
    });

    child.on('exit', (code, signal) => {
      addWorkerLog(`Worker exited (code: ${code}, signal: ${signal})`);
      if (state.workerProcess === child) {
        state.workerProcess = null;
      }
      if (state._stabilityTimer) { clearTimeout(state._stabilityTimer); state._stabilityTimer = null; }

      // AUTO-RESTART: If exit was NOT intentional, schedule restart
      if (!state.intentionalStop) {
        scheduleAutoRestart();
      }
    });

    child.on('error', (err) => {
      addWorkerLog(`❌ Worker error: ${err.message}`);
      if (state.workerProcess === child) {
        state.workerProcess = null;
      }
      if (state._stabilityTimer) { clearTimeout(state._stabilityTimer); state._stabilityTimer = null; }

      // AUTO-RESTART on error too
      if (!state.intentionalStop) {
        scheduleAutoRestart();
      }
    });

    // Reset backoff only AFTER the worker has been stable for 60s
    if (state._stabilityTimer) clearTimeout(state._stabilityTimer);
    state._stabilityTimer = setTimeout(() => {
      state._stabilityTimer = null;
      if (isWorkerRunning() && state.workerProcess === child) {
        state.consecutiveCrashes = 0;
        state.autoRestartBackoff = 1000;
        addWorkerLog('✅ Worker stable for 60s — restart backoff reset');
      }
    }, 60000);

    return { ok: true, running: true, pid: child.pid, message: 'Worker started successfully' };
  } catch (err) {
    addWorkerLog(`❌ Failed to spawn worker.py: ${err.message}`);
    if (!state.intentionalStop) {
      scheduleAutoRestart();
    }
    return { ok: false, running: false, error: err.message };
  }
}

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
  const includeNumbers = url.searchParams.get('numbers') === '1';
  let processedNumbers = null;
  let numbersCount = 0;
  try {
    const pPath = path.resolve(getWorkerCwd(), 'processed_numbers.json');
    if (fs.existsSync(pPath)) {
      const raw = fs.readFileSync(pPath, 'utf8');
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        numbersCount = Object.keys(data).length;
        if (includeNumbers) {
          processedNumbers = data;
        }
      }
    }
  } catch {}

  const active = getActiveWorkerInfo();
  if (active.running && state.restartTimer) {
    clearTimeout(state.restartTimer);
    state.restartTimer = null;
    state.consecutiveCrashes = 0;
  }
  return json({
    ok: true,
    running: active.running,
    pid: active.pid,
    external: active.external,
    logs: state.recentLogs.slice(-150),
    numbersCount,
    processedNumbers,
    autoRestart: !state.intentionalStop,
    consecutiveCrashes: state.consecutiveCrashes,
    restartPending: state.restartTimer !== null,
  });
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
  try {
    const body = await request.json();
    const action = String(body.action || 'status').toLowerCase();

    if (action === 'start') {
      const res = await startWorkerProcess();
      return json(res);
    } else if (action === 'stop') {
      await stopWorkerProcess();
      addWorkerLog('🛑 Worker stopped by panel request');
      return json({ ok: true, running: false, message: 'Worker stopped' });
    } else if (action === 'restart') {
      addWorkerLog('🔄 Restarting Python worker...');
      await stopWorkerProcess();
      await new Promise(r => setTimeout(r, 400));
      const res = await startWorkerProcess();
      return json(res);
    } else if (action === 'clear-logs') {
      state.recentLogs = [];
      state.consecutiveCrashes = 0;
      if (state.restartTimer) {
        clearTimeout(state.restartTimer);
        state.restartTimer = null;
      }
      return json({ ok: true, logs: [] });
    } else if (action === 'remove-numbers' || action === 'trash-numbers' || action === 'reuse-numbers') {
      const numbers = Array.isArray(body.numbers) ? body.numbers : (body.number ? [body.number] : []);
      const normalizedList = numbers.map(n => String(n).replace(/\D/g, '').slice(-10)).filter(n => n.length === 10);
      let removedCount = 0;

      const pPath = path.resolve(getWorkerCwd(), 'processed_numbers.json');
      if (fs.existsSync(pPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(pPath, 'utf8')) || {};
          for (const norm of normalizedList) {
            if (data[norm]) {
              delete data[norm];
              removedCount++;
            }
          }
          fs.writeFileSync(pPath, JSON.stringify(data, null, 2), 'utf8');
        } catch {}
      }

      const sPath = path.resolve(getWorkerCwd(), 'processed_success.json');
      if (fs.existsSync(sPath)) {
        try {
          const sData = JSON.parse(fs.readFileSync(sPath, 'utf8')) || {};
          for (const norm of normalizedList) {
            if (sData[norm]) {
              delete sData[norm];
            }
          }
          fs.writeFileSync(sPath, JSON.stringify(sData, null, 2), 'utf8');
        } catch {}
      }

      if (removedCount > 0) {
        addWorkerLog(`🔄 Purged ${removedCount} number(s) from worker history for reuse/trash`);
      }
      return json({ ok: true, removedCount, numbers: normalizedList });
    } else {
      return json({
        ok: true,
        running: isWorkerRunning(),
        pid: state.workerProcess?.pid || null,
        logs: state.recentLogs.slice(-150)
      });
    }
  } catch (err) {
    return json({ ok: false, error: err.message }, { status: 500 });
  }
}
