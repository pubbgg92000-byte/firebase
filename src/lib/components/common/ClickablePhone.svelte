<script>
  import { copyPhoneLocal } from '$lib/utils/clipboard.js';

  let {
    phone = '',
    raw = false,
    className = '',
    title = 'Click to copy without country code',
    oncopy = null
  } = $props();

  async function handleClick(e) {
    e.stopPropagation();
    if (!phone) return;
    const copied = await copyPhoneLocal(phone);
    if (oncopy) {
      oncopy(copied);
    }
  }
</script>

{#if phone}
  <button
    type="button"
    class="clickable-phone mono {className}"
    onclick={handleClick}
    {title}
  >
    {#if !raw}📱 {/if}{phone}
  </button>
{/if}

<style>
  .clickable-phone {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: inherit;
    font-family: inherit;
    color: inherit;
    padding: 0 2px;
    border-radius: 3px;
    text-decoration: underline;
    text-decoration-style: dashed;
    text-decoration-color: rgba(52, 211, 153, 0.5);
    transition: all 0.15s ease;
  }
  .clickable-phone:hover {
    color: #34d399;
    text-decoration-color: #34d399;
    background: rgba(52, 211, 153, 0.1);
  }
</style>
