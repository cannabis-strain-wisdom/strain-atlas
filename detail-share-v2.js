(() => {
  'use strict';

  const CONTRACT = 'CSW_DETAIL_SHARE_V2';
  const shell = document.getElementById('detail-shell');
  if (!shell) return;

  const text = value => typeof value === 'string' ? value.trim() : '';

  const currentCultivarId = () => {
    const root = shell.querySelector('.detail-public-v1[data-public-detail-id],.ucd-root[data-public-detail-id]');
    return text(root?.dataset?.publicDetailId) || text(new URL(location.href).searchParams.get('strain'));
  };

  const currentCultivarName = async id => {
    try {
      const source = window.__CSWRuntimeCatalogPromise;
      if (source && typeof source.then === 'function') {
        const catalog = await source;
        const cultivar = catalog?.cultivars?.find(item => item?.id === id);
        const name = text(cultivar?.name);
        if (name) return name;
      }
    } catch (_) {}

    const selectors = [
      '.ucd-title-row h2',
      '.public-hero-copy h2',
      '.detail-hero h2',
      '.detail-topbar strong',
    ];
    for (const selector of selectors) {
      const name = text(shell.querySelector(selector)?.textContent);
      if (name) return name;
    }
    return 'Cannabis Strain Wisdom';
  };

  const canonicalShareUrl = id => {
    const current = new URL(location.href);
    const clean = new URL(current.origin + current.pathname);
    if (id) clean.searchParams.set('strain', id);
    return clean.href;
  };

  const copyUrl = async url => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return;
    }
    const area = document.createElement('textarea');
    area.value = url;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand?.('copy');
    area.remove();
    if (!copied) throw new Error('clipboard unavailable');
  };

  const copiedFeedback = button => {
    button.classList.add('is-copied');
    window.setTimeout(() => button.classList.remove('is-copied'), 1200);
  };

  document.addEventListener('click', async event => {
    const button = event.target?.closest?.('#detail-shell [data-detail-share]');
    if (!button || !shell.contains(button)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const id = currentCultivarId();
    const name = await currentCultivarName(id);
    const url = canonicalShareUrl(id);
    const title = name === 'Cannabis Strain Wisdom' ? name : `${name} | Cannabis Strain Wisdom`;
    const payload = { title, text: title, url };

    window.__CSWDetailShareV2 = {
      status: 'READY',
      contract: CONTRACT,
      cultivarId: id,
      cultivarName: name,
      url,
    };

    try {
      if (typeof navigator.share === 'function') {
        await navigator.share(payload);
        window.__CSWDetailShareV2 = { ...window.__CSWDetailShareV2, status: 'SHARED', method: 'native' };
        return;
      }
      await copyUrl(url);
      copiedFeedback(button);
      window.__CSWDetailShareV2 = { ...window.__CSWDetailShareV2, status: 'SHARED', method: 'clipboard' };
    } catch (error) {
      if (error?.name === 'AbortError') {
        window.__CSWDetailShareV2 = { ...window.__CSWDetailShareV2, status: 'ABORTED', method: 'native' };
        return;
      }
      try {
        await copyUrl(url);
        copiedFeedback(button);
        window.__CSWDetailShareV2 = { ...window.__CSWDetailShareV2, status: 'SHARED', method: 'clipboard-fallback' };
      } catch (copyError) {
        window.__CSWDetailShareV2 = {
          ...window.__CSWDetailShareV2,
          status: 'FAIL_CLOSED',
          error: String(copyError?.message || error?.message || error),
        };
      }
    }
  }, true);

  window.__CSWDetailShareV2 = {
    status: 'PASS',
    contract: CONTRACT,
    cultivarId: currentCultivarId(),
  };
})();
