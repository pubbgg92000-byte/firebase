<script>
  import { autoEngine } from '$lib/automation-engine.svelte.js';
  import { registry } from '$lib/automation-registry.js';
  import ClickablePhone from '$lib/components/common/ClickablePhone.svelte';

  let {
    filteredDevices = [],
    searchQuery = $bindable(''),
    onrefresh,
    onclearused,
    onstepcand
  } = $props();
</script>

<!-- Eligible Device Queue View -->
<section class="card queue-section">
  <div class="card-header">
    <div>
      <h2 class="card-title">Eligible Device Pool ({filteredDevices.length})</h2>
      <p class="card-desc">
        Online devices discovered across all configured databases with known phone numbers.
        Protected numbers already verified are marked and protected from automatic re-testing.
      </p>
    </div>

    <div class="table-tools">
      <input
        type="text"
        class="search-input"
        placeholder="Search by device ID or phone..."
        bind:value={searchQuery}
      />
      <button class="btn btn-secondary btn-sm" onclick={onrefresh}>
        Refresh All DBs ↺
      </button>
      <button class="btn btn-ghost btn-sm" onclick={onclearused} title="Reset session used device tracking">
        Clear Session Tracking
      </button>
    </div>
  </div>

  {#if filteredDevices.length === 0}
    <div class="empty-state">
      <span class="empty-icon">📱</span>
      <h3>No eligible devices found</h3>
      <p>Make sure your Firebase databases have online devices with known phone numbers. You can discover numbers on the <a href="/discovery">Discovery page</a>.</p>
    </div>
  {:else}
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Database</th>
            <th>Source</th>
            <th>Device ID</th>
            <th>Phone Number</th>
            <th>Session</th>
            <th>Registry Status</th>
            <th style="text-align: right;">Action</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredDevices as cand (cand.compKey || cand.deviceId)}
            {@const normalized = cand.normalizedPhone}
            {@const isSuccess = normalized ? registry.isSuccessful(normalized) : false}
            {@const rec = normalized ? registry.getRecord(normalized) : null}
            {@const isUsed = autoEngine.usedDeviceKeys.includes(cand.compKey)}
            <tr>
              <td>
                <span class="db-pill" style="border-left: 3px solid {cand.conn?.color || '#38bdf8'}">
                  {cand.conn?.name || cand.connId}
                </span>
              </td>
              <td>
                {#if cand.source === 'online'}
                  <span class="badge badge-online">Online</span>
                {:else if cand.source === 'discovered'}
                  <span class="badge badge-purple" title="Discovered by background discovery engine">Discovered</span>
                {:else}
                  <span class="badge badge-info">Known</span>
                {/if}
              </td>
              <td>
                <span class="mono">{cand.deviceId}</span>
              </td>
              <td>
                <div class="phone-cell">
                  {#if cand.rawPhone}
                    <ClickablePhone phone={cand.rawPhone} raw={true} className="highlight" />
                  {:else}
                    <span class="mono">—</span>
                  {/if}
                  {#if normalized && normalized !== cand.rawPhone}
                    <span class="text-xs text-muted">({normalized})</span>
                  {/if}
                </div>
              </td>
              <td>
                {#if isUsed}
                  <span class="badge badge-info">Used this session</span>
                {:else}
                  <span class="badge badge-online">Ready</span>
                {/if}
              </td>
              <td>
                {#if isSuccess}
                  <span class="badge badge-success" title="Verified success! Protected against repeat runs.">
                    ✓ Verified
                  </span>
                {:else if rec && rec.status === 'suspended'}
                  <span class="badge badge-danger" title="Account reported suspended by bot">
                    ✕ Suspended
                  </span>
                {:else if rec && rec.status === 'expired'}
                  <span class="badge badge-warning" title="OTP expired after retry attempt">
                    ⏳ Expired
                  </span>
                {:else if rec && rec.status === 'rate_limited'}
                  <span class="badge badge-warning" title="Rate limit / retry later">
                    ⚠ Rate Limited
                  </span>
                {:else if rec}
                  <span class="badge badge-secondary">{rec.status}</span>
                {:else}
                  <span class="text-xs text-muted">Eligible</span>
                {/if}
              </td>
              <td style="text-align: right;">
                <button
                  class="btn btn-secondary btn-sm"
                  onclick={() => onstepcand && onstepcand(cand)}
                  disabled={autoEngine.jobState !== 'IDLE'}
                  title="Run single automation flow on this specific number"
                >
                  Run This Number
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>
