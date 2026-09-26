<script>
  import ClickablePhone from '$lib/components/common/ClickablePhone.svelte';

  let {
    registryRecords = [],
    registrySearch = $bindable(''),
    registryStatusFilter = $bindable('all'),
    registryStats = { total: 0, successful: 0, expired: 0, suspended: 0, rateLimited: 0, failed: 0 },
    filteredRegistry = [],
    isSyncingRegistry = false,
    onsyncregistry,
    ondownloadcsv,
    ondownloadregistry,
    onopenimport,
    onclearregistry,
    onmanualreuse
  } = $props();
</script>

<!-- Persistent Numbers Log & Registry View -->
<section class="card registry-section">
  <div class="card-header">
    <div>
      <h2 class="card-title">Numbers Log & Registry ({registryRecords.length})</h2>
      <p class="card-desc">
        All tested numbers with detailed outcomes (Successful, Expired, Suspended, Rate Limited, etc.).
        Protected from repeat looping and automatically retrieved across browser refreshes.
      </p>
    </div>

    <div class="table-tools">
      <input
        type="text"
        class="search-input"
        placeholder="Search phone, status, device..."
        bind:value={registrySearch}
      />
      <button class="btn btn-secondary btn-sm" onclick={onsyncregistry} disabled={isSyncingRegistry}>
        {isSyncingRegistry ? '⏳ Syncing...' : '🔄 Sync from Firebase'}
      </button>
      <button class="btn btn-secondary btn-sm" onclick={ondownloadcsv}>
        ⬇ Export CSV
      </button>
      <button class="btn btn-secondary btn-sm" onclick={ondownloadregistry}>
        ⬇ Export JSON
      </button>
      <button class="btn btn-secondary btn-sm" onclick={onopenimport}>
        ⬆ Import JSON
      </button>
      <button class="btn btn-danger-ghost btn-sm" onclick={onclearregistry}>
        Clear All
      </button>
    </div>
  </div>

  <!-- Status Filter Pills -->
  <div class="status-filter-pills">
    <button class="filter-pill {registryStatusFilter === 'all' ? 'active' : ''}" onclick={() => registryStatusFilter = 'all'}>
      All ({registryStats.total})
    </button>
    <button class="filter-pill {registryStatusFilter === 'successful' ? 'active' : ''}" onclick={() => registryStatusFilter = 'successful'}>
      ✓ Successful ({registryStats.successful})
    </button>
    <button class="filter-pill {registryStatusFilter === 'expired' ? 'active' : ''}" onclick={() => registryStatusFilter = 'expired'}>
      ⏱ Expired ({registryStats.expired})
    </button>
    <button class="filter-pill {registryStatusFilter === 'suspended' ? 'active' : ''}" onclick={() => registryStatusFilter = 'suspended'}>
      ⛔ Suspended ({registryStats.suspended})
    </button>
    <button class="filter-pill {registryStatusFilter === 'rate_limited' ? 'active' : ''}" onclick={() => registryStatusFilter = 'rate_limited'}>
      ⏳ Rate Limited ({registryStats.rateLimited})
    </button>
    <button class="filter-pill {registryStatusFilter === 'failed' ? 'active' : ''}" onclick={() => registryStatusFilter = 'failed'}>
      ✗ Failed ({registryStats.failed})
    </button>
  </div>

  {#if filteredRegistry.length === 0}
    <div class="empty-state">
      <span class="empty-icon">🛡</span>
      <h3>No numbers match this filter</h3>
      <p>Tested numbers will automatically be logged here with their complete status (successful, expired, suspended, rate limited).</p>
    </div>
  {:else}
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Normalized Phone</th>
            <th>Status</th>
            <th>Outcome / Reason</th>
            <th>Attempts</th>
            <th>Device ID</th>
            <th>Database</th>
            <th>Timestamp</th>
            <th style="text-align: right;">Manual Action</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredRegistry as rec (rec.phone)}
            <tr>
              <td>
                <ClickablePhone phone={rec.phone} raw={true} className="highlight" />
              </td>
              <td>
                {#if rec.status === 'successful' || rec.status === 'success'}
                  <span class="badge badge-success">✓ Successful</span>
                {:else if rec.status === 'expired'}
                  <span class="badge badge-warning">⏱ Expired</span>
                {:else if rec.status === 'suspended'}
                  <span class="badge badge-danger">⛔ Suspended</span>
                {:else if rec.status === 'rate_limited'}
                  <span class="badge badge-purple">⏳ Rate Limited</span>
                {:else if rec.status === 'already_registered'}
                  <span class="badge badge-purple" style="background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3);">⚠️ Already Reg</span>
                {:else if rec.status === 'invalid_number'}
                  <span class="badge badge-secondary">❌ Invalid Num</span>
                {:else if rec.status === 'invalid_otp'}
                  <span class="badge badge-warning">⚠️ Invalid OTP</span>
                {:else}
                  <span class="badge badge-danger">✗ Failed</span>
                {/if}
              </td>
              <td>
                <span class="text-xs text-muted truncate" style="max-width: 220px; display: inline-block;" title={rec.reason}>
                  {rec.reason || '—'}
                </span>
              </td>
              <td>
                <span class="badge badge-secondary">{rec.attempts || 1}</span>
              </td>
              <td>
                <span class="mono">{rec.deviceId || '—'}</span>
              </td>
              <td>
                <span class="mono text-xs truncate" title={rec.database}>{rec.database || '—'}</span>
              </td>
              <td>
                <span class="text-xs">{rec.completedAt || rec.updatedAt ? new Date(rec.completedAt || rec.updatedAt).toLocaleString() : '—'}</span>
              </td>
              <td style="text-align: right;">
                <button
                  class="btn btn-warning-ghost btn-sm"
                  onclick={() => onmanualreuse && onmanualreuse(rec.phone)}
                  title="Remove from numbers log to allow testing again"
                >
                  Allow Reuse
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>
