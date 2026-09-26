<script>
  import { autoEngine, clearLogs } from '$lib/automation-engine.svelte.js';
  import { copyText } from '$lib/utils/clipboard.js';

  let {
    activeLogSubTab = $bindable('worker'),
    workerLogs = [],
    workerRunning = false,
    workerToggling = false,
    onrefreshworkerlogs,
    onrestartworker,
    onclearworkerlogs,
    ontoggleworker
  } = $props();
</script>

<!-- Logs View with Dual Console -->
<section class="card logs-section">
  <div class="card-header">
    <div class="logs-header-subtabs">
      <button
        class="subtab-btn {activeLogSubTab === 'worker' ? 'active' : ''}"
        onclick={() => activeLogSubTab = 'worker'}
      >
        🖥️ Python Worker Terminal ({workerLogs.length})
        {#if workerRunning}
          <span class="inline-pulse-dot" title="Worker is live"></span>
        {/if}
      </button>
      <button
        class="subtab-btn {activeLogSubTab === 'orchestrator' ? 'active' : ''}"
        onclick={() => activeLogSubTab = 'orchestrator'}
      >
        ⚙️ Orchestration Logs ({autoEngine.logs.length})
      </button>
    </div>

    <div class="table-tools">
      {#if activeLogSubTab === 'worker'}
        <button class="btn btn-secondary btn-sm" onclick={() => copyText(workerLogs.map(l => `[${l.ts}] ${l.text}`).join('\n'))}>
          📋 Copy Worker Logs
        </button>
        <button class="btn btn-secondary btn-sm" onclick={onrefreshworkerlogs} title="Fetch latest logs from worker process">
          ↺ Refresh
        </button>
        <button class="btn btn-secondary btn-sm" onclick={onrestartworker} disabled={workerToggling}>
          🔄 Restart Worker
        </button>
        <button class="btn btn-ghost btn-sm" onclick={onclearworkerlogs}>
          🗑 Clear Console
        </button>
      {:else}
        <button class="btn btn-secondary btn-sm" onclick={() => copyText(autoEngine.logs.map(l => `[${l.ts}] ${l.type.toUpperCase()}: ${l.message}`).join('\n'))}>
          📋 Copy All Logs
        </button>
        <button class="btn btn-ghost btn-sm" onclick={clearLogs}>
          🗑 Clear Logs
        </button>
      {/if}
    </div>
  </div>

  {#if activeLogSubTab === 'worker'}
    <!-- Python Worker Terminal Console -->
    {#if workerLogs.length === 0}
      <div class="empty-state-sm">
        <span class="idle-icon">🖥️</span>
        <p>No terminal output recorded yet. Launch the worker via <strong>"▶ Start Process"</strong> above.</p>
        <button class="btn btn-primary btn-sm" style="margin-top: 10px;" onclick={ontoggleworker} disabled={workerToggling}>
          ▶ Start Worker Now
        </button>
      </div>
    {:else}
      <div class="terminal-console">
        {#each workerLogs as log, i (i)}
          <div class="terminal-line {log.text.includes('BOT:') || log.text.includes('Conversation cancelled') ? 'line-bot' : ''} {log.text.includes('OTP') || log.text.includes('DETECTED') ? 'line-otp' : ''} {log.text.includes('ERROR') || log.text.includes('Failed') ? 'line-error' : ''}">
            <span class="term-ts">[{log.ts}]</span>
            <span class="term-text">{log.text}</span>
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    <!-- Orchestration Event Logs -->
    {#if autoEngine.logs.length === 0}
      <div class="empty-state-sm">
        <p>No orchestration events recorded yet.</p>
      </div>
    {:else}
      <div class="logs-console">
        {#each autoEngine.logs as log (log.id)}
          <div class="log-line log-type-{log.type}">
            <span class="log-ts">[{log.ts}]</span>
            <span class="log-tag tag-{log.type}">{log.type.toUpperCase()}</span>
            <span class="log-msg">{log.message}</span>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</section>
