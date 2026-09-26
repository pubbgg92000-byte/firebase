import { json } from '@sveltejs/kit';
import { spawn, exec } from 'node:child_process';
import path from 'node:path';

/** @type {import('node:child_process').ChildProcess | null} */
let workerProcess = null;
let recentLogs = [];
const MAX_LOGS = 1000;

function addWorkerLog(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return;
  // If text contains multiple lines, break them up cleanly
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const l = line.trim();
    if (!l) continue;
    recentLogs.push({ ts: new Date().toLocaleTimeString(), text: l });
  }
  if (recentLogs.length > MAX_LOGS) {
    recentLogs = recentLogs.slice(-MAX_LOGS);
  }
}

function getWorkerCwd() {
  return path.resolve(process.cwd(), '_python_worker_ref');
}

function isWorkerRunning() {
  return workerProcess !== null && workerProcess.exitCode === null && !workerProcess.killed;
}

function killZombieWorkers() {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      exec('powershell -Command "Get-CimInstance Win32_Process -Filter \\"CommandLine like \'%worker.py%\'\\" | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"', () => {
        resolve(true);
      });
    } else {
      exec('pkill -f worker.py', () => resolve(true));
    }
  });
}

function stopWorkerProcess() {
  return new Promise((resolve) => {
    if (!workerProcess) {
      killZombieWorkers().then(() => resolve(true));
      return;
    }
    const pid = workerProcess.pid;
    try {
      if (process.platform === 'win32' && pid) {
        exec(`taskkill /pid ${pid} /T /F`, async () => {
          workerProcess = null;
          await killZombieWorkers();
          resolve(true);
        });
      } else {
        workerProcess.kill('SIGTERM');
        workerProcess = null;
        killZombieWorkers().then(() => resolve(true));
      }
    } catch {
      workerProcess = null;
      killZombieWorkers().then(() => resolve(true));
    }
  });
}

function startWorkerProcess() {
  if (isWorkerRunning()) {
    return { ok: true, running: true, pid: workerProcess?.pid, message: 'Worker is already running' };
  }

  const cwd = getWorkerCwd();
  addWorkerLog('🚀 Starting Python Telegram Worker (worker.py)...');

  try {
    workerProcess = spawn('python', ['-u', 'worker.py'], {
      cwd,
      shell: process.platform === 'win32',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    workerProcess.stdout?.on('data', (data) => {
      addWorkerLog(data.toString());
    });

    workerProcess.stderr?.on('data', (data) => {
      addWorkerLog(`[stderr] ${data.toString()}`);
    });

    workerProcess.on('exit', (code, signal) => {
      addWorkerLog(`Worker exited (code: ${code}, signal: ${signal})`);
      workerProcess = null;
    });

    workerProcess.on('error', (err) => {
      addWorkerLog(`❌ Worker error: ${err.message}`);
      workerProcess = null;
    });

    return { ok: true, running: true, pid: workerProcess.pid, message: 'Worker started successfully' };
  } catch (err) {
    addWorkerLog(`❌ Failed to spawn worker.py: ${err.message}`);
    return { ok: false, running: false, error: err.message };
  }
}

/** @type {import('./$types').RequestHandler} */
export async function GET() {
  return json({
    ok: true,
    running: isWorkerRunning(),
    pid: workerProcess?.pid || null,
    logs: recentLogs.slice(-150)
  });
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
  try {
    const body = await request.json();
    const action = String(body.action || 'status').toLowerCase();

    if (action === 'start') {
      const res = startWorkerProcess();
      return json(res);
    } else if (action === 'stop') {
      await stopWorkerProcess();
      addWorkerLog('🛑 Worker stopped by panel request');
      return json({ ok: true, running: false, message: 'Worker stopped' });
    } else if (action === 'restart') {
      addWorkerLog('🔄 Restarting Python worker...');
      await stopWorkerProcess();
      await new Promise(r => setTimeout(r, 600));
      const res = startWorkerProcess();
      return json(res);
    } else if (action === 'clear-logs') {
      recentLogs = [];
      return json({ ok: true, logs: [] });
    } else {
      return json({
        ok: true,
        running: isWorkerRunning(),
        pid: workerProcess?.pid || null,
        logs: recentLogs.slice(-150)
      });
    }
  } catch (err) {
    return json({ ok: false, error: err.message }, { status: 500 });
  }
}
