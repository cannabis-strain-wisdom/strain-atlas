(() => {
  'use strict';

  const CONTRACT = 'CSW_DETAIL_INTERACTION_V1';
  const shell = document.getElementById('detail-shell');
  if (!shell) return;

  const LABELS = {
    lineage: '系譜',
    type: 'タイプ',
    cannabinoid: 'カンナビノイド',
    aroma: 'アロマ',
    flavor: 'フレーバー',
    terpene: 'テルペン',
    effects: '効果',
    cultivation: '栽培情報',
    morphology: '形態',
    'origin-history': '起源と歴史',
  };

  const REASON_ORDER = [
    'lineage',
    'type',
    'cannabinoid',
    'aroma',
    'flavor',
    'terpene',
    'effects',
    'cultivation',
    'morphology',
    'origin-history',
  ];

  const text = value => typeof value === 'string' ? value.trim() : '';

  const choosePanel = (root, kind) =>
    root.querySelector(`[data-profile-kind="${kind}"]`) ||
    root.querySelector(`[data-ucd-panel="${kind}"]`);

  const isUnavailable = (panel, kind) => {
    if (!panel) return true;
    if (panel.dataset?.unavailableDetailCard === 'v1') return true;
    if (panel.matches?.('[data-unavailable-detail-card="v1"],[data-terpene-unavailable="v1"]')) return true;
    if (panel.querySelector?.('.ucd-terpene-unavailable,.ucd-data-unavailable,[data-unavailable-detail-card="v1"]')) return true;
    const content = text(panel.innerText);
    if (kind === 'terpene' && content.includes('個別テルペンは確認できていません')) return true;
    return false;
  };

  const reasonFor = (panel, kind) => {
    const label = LABELS[kind] || kind;
    const source = panel?.querySelector?.('.ucd-terpene-unavailable,.ucd-data-unavailable,[data-unavailable-detail-card="v1"]') || panel;
    const paragraphs = [...source?.querySelectorAll?.('p') || []]
      .map(node => text(node.textContent))
      .filter(Boolean);
    let reason = paragraphs.join(' ');
    if (!reason) {
      reason = text(source?.innerText)
        .split('\n')
        .map(value => value.trim())
        .filter(Boolean)
        .filter(value => value !== label && value !== '未確認')
        .join(' ');
    }
    return {
      kind,
      label,
      reason: reason || '確認できる根拠がまだありません。',
    };
  };

  const setButtonState = (button, unavailable, kind) => {
    if (!button) return;
    button.dataset.cswDetailState = unavailable ? 'inactive' : 'active';
    button.setAttribute('aria-disabled', unavailable ? 'true' : 'false');
    if (unavailable) {
      button.setAttribute('tabindex', '-1');
      if ('disabled' in button) button.disabled = true;
      if (button.hasAttribute('aria-expanded')) button.setAttribute('aria-expanded', 'false');
      if (button.hasAttribute('aria-pressed')) button.setAttribute('aria-pressed', 'false');
      button.classList.remove('is-active');
      if (kind && LABELS[kind]) button.setAttribute('aria-label', `${LABELS[kind]}：未確認`);
    } else {
      if ('disabled' in button) button.disabled = false;
      if (button.getAttribute('tabindex') === '-1') button.removeAttribute('tabindex');
    }
  };

  const setSummaryState = (summary, unavailable, kind) => {
    if (!summary) return;
    summary.dataset.cswDetailState = unavailable ? 'inactive' : 'active';
    summary.setAttribute('aria-disabled', unavailable ? 'true' : 'false');
    if (unavailable) {
      summary.setAttribute('tabindex', '-1');
      if (kind && LABELS[kind]) summary.setAttribute('aria-label', `${LABELS[kind]}：未確認`);
    } else if (summary.getAttribute('tabindex') === '-1') {
      summary.removeAttribute('tabindex');
    }
  };

  const ensureStyle = () => {
    if (document.getElementById('csw-detail-interaction-v1-style')) return;
    const style = document.createElement('style');
    style.id = 'csw-detail-interaction-v1-style';
    style.textContent = `
      .detail-public-v1 [data-csw-detail-state="inactive"]{
        cursor:default!important;opacity:.58;pointer-events:none!important;
        border-color:rgba(255,255,255,.075)!important;background:rgba(255,255,255,.012)!important
      }
      .detail-public-v1 button[data-csw-detail-state="inactive"]>i,
      .detail-public-v1 summary[data-csw-detail-state="inactive"]>i{
        display:none!important
      }
      .detail-public-v1 button[data-csw-detail-state="inactive"]::after,
      .detail-public-v1 summary[data-csw-detail-state="inactive"]::after{
        content:'未確認';flex:0 0 auto;color:#66756c;font-size:10px;font-weight:800;line-height:1.2;letter-spacing:0
      }
      .detail-public-v1 .ucd-primary-nav button[data-csw-detail-state="inactive"],
      .detail-public-v1 .ucd-profile-nav button[data-csw-detail-state="inactive"]{
        grid-template-columns:minmax(0,1fr) auto;align-items:center
      }
      .detail-public-v1 [data-csw-staged-sensory-sub][data-csw-detail-state="active"]{
        position:relative;grid-template-columns:minmax(0,1fr) auto;align-items:center;cursor:pointer
      }
      .detail-public-v1 [data-csw-staged-sensory-sub][data-csw-detail-state="active"]>small,
      .detail-public-v1 [data-csw-staged-sensory-sub][data-csw-detail-state="inactive"]>small{
        display:none!important
      }
      .detail-public-v1 [data-csw-staged-sensory-sub][data-csw-detail-state="active"]::after{
        content:'⌄';color:#d8bd62;font-size:14px;font-weight:800;line-height:1
      }
      .detail-public-v1 [data-csw-staged-sensory-sub][data-csw-detail-state="inactive"],
      .detail-public-v1 [data-csw-staged-ec-sub][data-csw-detail-state="inactive"]{
        position:relative;display:flex;align-items:center;justify-content:space-between;gap:6px
      }
      #detail-shell .ucd-lineage[data-lineage-unavailable="v1"]>summary[data-csw-detail-state="inactive"]{
        display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;cursor:default!important;
        opacity:.58;pointer-events:none!important
      }
      #detail-shell .ucd-lineage[data-lineage-unavailable="v1"]>summary[data-csw-detail-state="inactive"]>i{
        display:none!important
      }
      #detail-shell .ucd-lineage[data-lineage-unavailable="v1"]>summary[data-csw-detail-state="inactive"]::after{
        content:'未確認';color:#66756c;font-size:10px;font-weight:800;line-height:1.2;letter-spacing:0
      }
      .csw-verification-status-v1{
        margin:18px 0 0;border-top:1px solid rgba(216,189,98,.10);border-bottom:1px solid rgba(216,189,98,.10)
      }
      .csw-verification-status-v1>summary{
        display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:48px;padding:10px 2px;
        cursor:pointer;list-style:none;color:#aebbb3
      }
      .csw-verification-status-v1>summary::-webkit-details-marker{display:none}
      .csw-verification-status-v1>summary>span{font-size:12px;font-weight:850;letter-spacing:.04em}
      .csw-verification-status-v1>summary::after{content:'⌄';color:#d8bd62;font-size:14px;font-weight:800;transition:transform .16s ease}
      .csw-verification-status-v1[open]>summary::after{transform:rotate(180deg)}
      .csw-verification-status-v1-body{display:grid;gap:9px;padding:0 0 13px}
      .csw-verification-status-v1-item{padding:10px 11px;border:1px solid rgba(255,255,255,.065);border-radius:11px;background:rgba(255,255,255,.018)}
      .csw-verification-status-v1-item strong{display:block;color:#c4cec7;font-size:13px;line-height:1.4}
      .csw-verification-status-v1-item p{margin:5px 0 0;color:#829087;font-size:13px;line-height:1.65}
    `;
    document.head.appendChild(style);
  };

  const renderVerificationStatus = (root, reasons) => {
    const sources = root.querySelector('.ucd-sources');
    if (!sources) return;
    let disclosure = root.querySelector('[data-csw-verification-status="v1"]');

    if (!reasons.length) {
      disclosure?.remove();
      return;
    }

    const ordered = [...reasons].sort((a, b) =>
      REASON_ORDER.indexOf(a.kind) - REASON_ORDER.indexOf(b.kind)
    );
    const signature = JSON.stringify(ordered);
    if (!disclosure) {
      disclosure = document.createElement('details');
      disclosure.className = 'csw-verification-status-v1';
      disclosure.dataset.cswVerificationStatus = 'v1';
      const summary = document.createElement('summary');
      const label = document.createElement('span');
      label.textContent = '確認状況';
      summary.appendChild(label);
      const body = document.createElement('div');
      body.className = 'csw-verification-status-v1-body';
      disclosure.append(summary, body);
      sources.insertAdjacentElement('beforebegin', disclosure);
    }

    if (disclosure.dataset.cswVerificationSignature !== signature) {
      const body = disclosure.querySelector('.csw-verification-status-v1-body');
      const nodes = ordered.map(item => {
        const row = document.createElement('div');
        row.className = 'csw-verification-status-v1-item';
        row.dataset.cswVerificationKind = item.kind;
        const title = document.createElement('strong');
        title.textContent = `${item.label}：未確認`;
        const reason = document.createElement('p');
        reason.textContent = item.reason;
        row.append(title, reason);
        return row;
      });
      body.replaceChildren(...nodes);
      disclosure.dataset.cswVerificationSignature = signature;
      disclosure.open = false;
    }
  };

  const decorate = () => {
    ensureStyle();
    const root = shell.querySelector('.detail-public-v1[data-public-detail-id],.ucd-root[data-public-detail-id]');
    if (!root) return false;

    const reasonMap = new Map();
    const addReason = (panel, kind) => {
      if (!LABELS[kind] || reasonMap.has(kind)) return;
      reasonMap.set(kind, reasonFor(panel, kind));
    };

    const sensoryButtons = [...root.querySelectorAll('[data-csw-staged-sensory-sub]')];
    for (const button of sensoryButtons) {
      const kind = button.dataset.cswStagedSensorySub;
      if (!LABELS[kind]) continue;
      const panel = choosePanel(root, kind);
      const unavailable = isUnavailable(panel, kind);
      const helper = text(button.dataset.cswSensoryHelper) || text(button.querySelector('small')?.textContent);
      setButtonState(button, unavailable, kind);
      if (!unavailable && helper) button.setAttribute('aria-label', `${LABELS[kind]}：${helper}`);
      if (unavailable) addReason(panel, kind);
    }

    const ecButtons = [...root.querySelectorAll('[data-csw-staged-ec-sub]')];
    for (const button of ecButtons) {
      const kind = button.dataset.cswStagedEcSub;
      if (!LABELS[kind]) continue;
      const panel = root.querySelector(`[data-csw-staged-ec-section="${kind}"]`);
      const unavailable = isUnavailable(panel, kind);
      setButtonState(button, unavailable, kind);
      if (unavailable) addReason(panel, kind);
    }

    const primaryButtons = [...root.querySelectorAll('[data-ucd-primary-tab]')];
    for (const button of primaryButtons) {
      const kind = button.dataset.ucdPrimaryTab;
      if (!LABELS[kind]) continue;
      const panel = root.querySelector(`[data-ucd-primary-panel="${kind}"]`);
      const unavailable = isUnavailable(panel, kind);
      setButtonState(button, unavailable, kind);
      if (unavailable) addReason(panel, kind);
    }

    const profileButtons = [...root.querySelectorAll('[data-ucd-tab]')];
    for (const button of profileButtons) {
      const kind = button.dataset.ucdTab;
      if (kind === 'sensory-group' || kind === 'effect-cultivation' || !LABELS[kind]) continue;
      const panel = root.querySelector(`[data-ucd-panel="${kind}"]`);
      const unavailable = isUnavailable(panel, kind);
      setButtonState(button, unavailable, kind);
      if (unavailable) addReason(panel, kind);
    }

    const sensoryParent = root.querySelector('[data-csw-staged-sensory-parent],[data-ucd-tab="sensory-group"]');
    if (sensoryParent && sensoryButtons.length) {
      setButtonState(sensoryParent, sensoryButtons.every(button => button.dataset.cswDetailState === 'inactive'));
    }

    const ecParent = root.querySelector('[data-csw-staged-ec-parent],[data-ucd-tab="effect-cultivation"]');
    if (ecParent && ecButtons.length) {
      setButtonState(ecParent, ecButtons.every(button => button.dataset.cswDetailState === 'inactive'));
    }

    const unavailableLineage = shell.querySelector('.ucd-lineage[data-lineage-unavailable="v1"]');
    if (unavailableLineage) {
      const summary = unavailableLineage.querySelector(':scope > summary');
      const body = unavailableLineage.querySelector(':scope > div');
      unavailableLineage.open = false;
      setSummaryState(summary, true, 'lineage');
      addReason(body || unavailableLineage, 'lineage');
    }

    const reasons = [...reasonMap.values()];
    renderVerificationStatus(root, reasons);
    root.dataset.cswDetailInteraction = 'v1';
    root.dataset.cswDetailInactiveScope = 'all';
    window.__CSWDetailInteractionV1 = {
      status: 'PASS',
      contract: CONTRACT,
      cultivarId: root.dataset.publicDetailId || '',
      scope: 'all-detail-categories',
      inactiveKinds: reasons.map(item => item.kind),
    };
    return true;
  };

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      try {
        decorate();
      } catch (error) {
        window.__CSWDetailInteractionV1 = {
          status: 'FAIL_CLOSED',
          contract: CONTRACT,
          error: String(error?.message || error),
        };
        console.error(CONTRACT, error);
      }
    });
  };

  new MutationObserver(schedule).observe(shell, { childList: true, subtree: true });
  shell.addEventListener('click', event => {
    const inactive = event.target?.closest?.('[data-csw-detail-state="inactive"]');
    if (inactive) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    schedule();
  }, true);
  window.addEventListener('popstate', schedule);
  schedule();
  setTimeout(schedule, 250);
  setTimeout(schedule, 1000);
})();
