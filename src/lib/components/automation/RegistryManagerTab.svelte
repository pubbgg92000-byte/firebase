<script>
  import ClickablePhone from '$lib/components/common/ClickablePhone.svelte';
  import { isRecordInDb } from '$lib/automation-engine.svelte.js';

  let {
    registryRecords = [],
    registrySearch = $bindable(''),
    registryStatusFilter = $bindable('all'),
    registryStats = { total: 0, successful: 0, expired: 0, suspended: 0, rateLimited: 0, failed: 0 },
    filteredRegistry = [],
    isSyncingRegistry = false,
    dbPresenceSets = null,
    onsyncregistry,
    ondownloadcsv,
    ondownloadregistry,
    onopenimport,
    onclearregistry,
    onmanualreuse,
    ontrashselected,
    ontrashnotindb
  } = $props();

  // Multi-selection state
  let selectedPhones = $state(new Set());

  let selectedCount = $derived(selectedPhones.size);
  let isAllFilteredSelected = $derived(
    filteredRegistry.length > 0 && filteredRegistry.every(r => selectedPhones.has(r.phone))
  );
  let isSomeFilteredSelected = $derived(
    filteredRegistry.some(r => selectedPhones.has(r.phone)) && !isAllFilteredSelected
  );

  // Derived counts for Failed & DB presence
  let failedCount = $derived(
    registryRecords.filter(r => {
      const st = String(r.status || '').toLowerCase();
      return !['successful', 'success', 'expired', 'suspended', 'rate_limited'].includes(st);
    }).length
  );

  let notInDbCount = $derived(
    registryRecords.filter(r => !isRecordInDb(r, dbPresenceSets)).length
  );

  let inDbCount = $derived(
    registryRecords.filter(r => isRecordInDb(r, dbPresenceSets)).length
  );

  function toggleSelect(phone) {
    const next = new Set(selectedPhones);
    if (next.has(phone)) {
      next.delete(phone);
    } else {
      next.add(phone);
    }
    selectedPhones = next;
  }

  function selectAllFiltered() {
    const next = new Set(selectedPhones);
    for (const rec of filteredRegistry) {
      if (rec.phone) next.add(rec.phone);
    }
    selectedPhones = next;
  }

  function selectAllFailed() {
    const next = new Set(selectedPhones);
    for (const rec of registryRecords) {
      const st = String(rec.status || '').toLowerCase();
      if (!['successful', 'success', 'expired', 'suspended', 'rate_limited'].includes(st)) {
        if (rec.phone) next.add(rec.phone);
      }
    }
    selectedPhones = next;
  }

  function selectNotInDb() {
    const next = new Set(selectedPhones);
    for (const rec of registryRecords) {
      if (!isRecordInDb(rec, dbPresenceSets)) {
        if (rec.phone) next.add(rec.phone);
      }
    }
    selectedPhones = next;
  }

  function deselectAll() {
    selectedPhones = new Set();
  }

  function handleMasterToggle() {
    if (isAllFilteredSelected) {
      const next = new Set(selectedPhones);
      for (const rec of filteredRegistry) {
        next.delete(rec.phone);
      }
      selectedPhones = next;
    } else {
      selectAllFiltered();
    }
  }

  function handleReuseSelected() {
    if (selectedPhones.size === 0) return;
    const list = Array.from(selectedPhones);
    if (onmanualreuse) {
      onmanualreuse(list);
      selectedPhones = new Set();
    }
  }

  function handleTrashSelected() {
    if (selectedPhones.size === 0) return;
    const list = Array.from(selectedPhones);
    if (ontrashselected) {
      ontrashselected(list);
      selectedPhones = new Set();
    }
  }

  function handleTrashNotInDb() {
    if (ontrashnotindb) {
      ontrashnotindb();
      selectedPhones = new Set();
    }
  }

  function handleReuseAllFiltered() {
    if (filteredRegistry.length === 0) return;
    const list = filteredRegistry.map(r => r.phone).filter(Boolean);
    if (onmanualreuse) {
      onmanualreuse(list);
      selectedPhones = new Set();
    }
  }

  function handleExportSelectedJson() {
    if (selectedPhones.size === 0) return;
    const selectedRecords = filteredRegistry.filter(r => selectedPhones.has(r.phone));
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(selectedRecords, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `selected_registry_numbers_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }
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

  <!-- Status Filter Pills & Quick Bulk Action Strip -->
  <div class="filter-strip">
    <div class="status-filter-pills">
      <button class="filter-pill {registryStatusFilter === 'all' ? 'active' : ''}" onclick={() => { registryStatusFilter = 'all'; deselectAll(); }}>
        All ({registryStats.total})
      </button>
      <button class="filter-pill {registryStatusFilter === 'successful' ? 'active' : ''}" onclick={() => { registryStatusFilter = 'successful'; deselectAll(); }}>
        ✓ Successful ({registryStats.successful})
      </button>
      <button class="filter-pill {registryStatusFilter === 'expired' ? 'active' : ''}" onclick={() => { registryStatusFilter = 'expired'; deselectAll(); }}>
        ⏱ Expired ({registryStats.expired})
      </button>
      <button class="filter-pill {registryStatusFilter === 'suspended' ? 'active' : ''}" onclick={() => { registryStatusFilter = 'suspended'; deselectAll(); }}>
        ⛔ Suspended ({registryStats.suspended})
      </button>
      <button class="filter-pill {registryStatusFilter === 'rate_limited' ? 'active' : ''}" onclick={() => { registryStatusFilter = 'rate_limited'; deselectAll(); }}>
        ⏳ Rate Limited ({registryStats.rateLimited})
      </button>
      <button class="filter-pill {registryStatusFilter === 'failed' ? 'active' : ''}" onclick={() => { registryStatusFilter = 'failed'; deselectAll(); }}>
        ✗ Failed ({registryStats.failed})
      </button>
      <button class="filter-pill {registryStatusFilter === 'not_in_db' ? 'active' : ''}" style="color: #f87171;" onclick={() => { registryStatusFilter = 'not_in_db'; deselectAll(); }}>
        🗑 Not in DB ({notInDbCount})
      </button>
      <button class="filter-pill {registryStatusFilter === 'in_db' ? 'active' : ''}" style="color: #4ade80;" onclick={() => { registryStatusFilter = 'in_db'; deselectAll(); }}>
        🟢 In DB ({inDbCount})
      </button>
    </div>

    <!-- Quick bulk actions right next to filter pills -->
    <div class="bulk-quick-strip">
      <button
        type="button"
        class="btn btn-secondary btn-sm"
        onclick={selectAllFiltered}
        title="Select all {filteredRegistry.length} visible numbers"
      >
        ☑ Select Visible ({filteredRegistry.length})
      </button>
      <button
        type="button"
        class="btn btn-secondary btn-sm"
        onclick={selectAllFailed}
        disabled={failedCount === 0}
        title="Select all {failedCount} failed numbers"
      >
        ☑ Select All Failed ({failedCount})
      </button>
      <button
        type="button"
        class="btn btn-secondary btn-sm"
        onclick={selectNotInDb}
        disabled={notInDbCount === 0}
        title="Select all {notInDbCount} numbers not in active database"
      >
        ☑ Select Not in DB ({notInDbCount})
      </button>
      {#if selectedCount > 0}
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          onclick={deselectAll}
          title="Clear current selection"
        >
          ☐ Deselect All
        </button>
      {/if}
      <button
        type="button"
        class="btn btn-danger-ghost btn-sm"
        onclick={handleTrashNotInDb}
        disabled={notInDbCount === 0}
        title="Permanently trash and purge all {notInDbCount} numbers not found in any database"
      >
        🗑 Trash All Not in DB ({notInDbCount})
      </button>
      <button
        type="button"
        class="btn btn-warning-ghost btn-sm btn-reuse-filter"
        onclick={handleReuseAllFiltered}
        disabled={filteredRegistry.length === 0}
        title="Allow reuse for all {filteredRegistry.length} numbers in current filter (auto-trashes any not in DB)"
      >
        {#if registryStatusFilter === 'failed'}
          🔄 Allow Reuse All {filteredRegistry.length} Failed
        {:else if registryStatusFilter === 'not_in_db'}
          🗑 Trash All {filteredRegistry.length} (Not in DB)
        {:else if registryStatusFilter === 'expired'}
          🔄 Allow Reuse All {filteredRegistry.length} Expired
        {:else if registryStatusFilter === 'suspended'}
          🔄 Allow Reuse All {filteredRegistry.length} Suspended
        {:else if registryStatusFilter === 'rate_limited'}
          🔄 Allow Reuse All {filteredRegistry.length} Rate Limited
        {:else if registryStatusFilter === 'successful'}
          🔄 Allow Reuse All {filteredRegistry.length} Successful
        {:else}
          🔄 Allow Reuse All {filteredRegistry.length} Filtered
        {/if}
      </button>
    </div>
  </div>

  <!-- Batch Action Bar (shown when 1 or more numbers are selected) -->
  {#if selectedCount > 0}
    <div class="batch-action-bar">
      <div class="batch-bar-left">
        <span class="batch-pill">{selectedCount}</span>
        <span class="batch-label">of {registryRecords.length} numbers selected</span>
      </div>
      <div class="batch-bar-actions">
        <button
          type="button"
          class="btn btn-warning btn-sm batch-reuse-btn"
          onclick={handleReuseSelected}
          title="Allow reuse: returns to retry queue if in DB, trashes & purges if not in DB"
        >
          🔄 Allow Reuse Selected ({selectedCount})
        </button>
        <button
          type="button"
          class="btn btn-danger btn-sm"
          onclick={handleTrashSelected}
          title="Permanently trash and purge {selectedCount} selected numbers from registry, Firebase, and worker"
        >
          🗑 Trash Selected ({selectedCount})
        </button>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          onclick={handleExportSelectedJson}
          title="Download JSON of {selectedCount} selected numbers"
        >
          ⬇ Export Selected
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          onclick={deselectAll}
          title="Clear current selection"
        >
          Deselect All ✕
        </button>
      </div>
    </div>
  {/if}

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
            <th style="width: 40px; text-align: center;">
              <input
                type="checkbox"
                class="reg-cb"
                checked={isAllFilteredSelected}
                indeterminate={isSomeFilteredSelected}
                onchange={handleMasterToggle}
                title={isAllFilteredSelected ? 'Deselect all visible' : 'Select all visible'}
              />
            </th>
            <th>Normalized Phone</th>
            <th>Status</th>
            <th>DB Presence</th>
            <th>Outcome / Reason</th>
            <th>Attempts</th>
            <th>Device ID</th>
            <th>Database</th>
            <th>Timestamp</th>
            <th style="text-align: right; min-width: 170px;">Manual Action</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredRegistry as rec (rec.phone)}
            {@const inDb = isRecordInDb(rec, dbPresenceSets)}
            <tr
              class={selectedPhones.has(rec.phone) ? 'row-selected' : ''}
              onclick={(e) => {
                if (!e.target.closest('button') && !e.target.closest('a') && !e.target.closest('input')) {
                  toggleSelect(rec.phone);
                }
              }}
              style="cursor: pointer;"
              title="Click row to select/deselect"
            >
              <td style="width: 40px; text-align: center;">
                <input
                  type="checkbox"
                  class="reg-cb"
                  checked={selectedPhones.has(rec.phone)}
                  onchange={() => toggleSelect(rec.phone)}
                  title={selectedPhones.has(rec.phone) ? 'Deselect' : 'Select'}
                />
              </td>
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
                {#if inDb}
                  <span class="badge badge-success" title="Device or number exists in active database">🟢 In DB</span>
                {:else}
                  <span class="badge badge-danger" title="Device and number NOT found in any database">🗑 Not in DB</span>
                {/if}
              </td>
              <td>
                <span class="text-xs text-muted truncate" style="max-width: 200px; display: inline-block;" title={rec.reason}>
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
              <td style="text-align: right; white-space: nowrap;">
                <button
                  class="btn btn-warning-ghost btn-xs"
                  onclick={(e) => {
                    e.stopPropagation();
                    if (onmanualreuse) onmanualreuse(rec.phone);
                  }}
                  title={inDb ? 'Return to Candidate Pool to retry' : 'Allow reuse (will trash & purge because not in DB)'}
                >
                  Allow Reuse
                </button>
                <button
                  class="btn btn-danger-ghost btn-xs"
                  style="margin-left: 4px;"
                  onclick={(e) => {
                    e.stopPropagation();
                    if (ontrashselected) ontrashselected(rec.phone);
                  }}
                  title="Permanently trash and purge from registry, Firebase, and worker"
                >
                  🗑 Trash
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Bottom summary & batch actions footer -->
    <div class="registry-footer-bar">
      <span class="reg-footer-count">
        Showing {filteredRegistry.length} of {registryRecords.length} recorded numbers
        {#if selectedCount > 0}
          • <strong style="color: #fbbf24;">{selectedCount} selected</strong>
        {/if}
      </span>
      <div class="reg-footer-actions">
        {#if selectedCount > 0}
          <button
            class="btn btn-warning btn-xs"
            onclick={handleReuseSelected}
            title="Allow reuse of {selectedCount} selected numbers (re-enables in DB, trashes not in DB)"
          >
            🔄 Allow Reuse Selected ({selectedCount})
          </button>
          <button
            class="btn btn-danger btn-xs"
            onclick={handleTrashSelected}
            title="Permanently trash and purge {selectedCount} selected numbers"
          >
            🗑 Trash Selected ({selectedCount})
          </button>
        {/if}
        <button
          class="btn btn-warning-ghost btn-xs btn-reuse-filter"
          onclick={handleReuseAllFiltered}
          disabled={filteredRegistry.length === 0}
          title="Allow reuse of all {filteredRegistry.length} currently filtered numbers"
        >
          {#if registryStatusFilter === 'failed'}
            🔄 Allow Reuse All {filteredRegistry.length} Failed
          {:else if registryStatusFilter === 'not_in_db'}
            🗑 Trash All {filteredRegistry.length} (Not in DB)
          {:else if registryStatusFilter === 'expired'}
            🔄 Allow Reuse All {filteredRegistry.length} Expired
          {:else if registryStatusFilter === 'suspended'}
            🔄 Allow Reuse All {filteredRegistry.length} Suspended
          {:else if registryStatusFilter === 'rate_limited'}
            🔄 Allow Reuse All {filteredRegistry.length} Rate Limited
          {:else if registryStatusFilter === 'successful'}
            🔄 Allow Reuse All {filteredRegistry.length} Successful
          {:else}
            🔄 Allow Reuse All {filteredRegistry.length} Filtered
          {/if}
        </button>
      </div>
    </div>
  {/if}
</section>
