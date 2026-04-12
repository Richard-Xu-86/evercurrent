/**
 * js/ui.js — Pure UI rendering, no API calls
 */

const AVATAR_COLORS = {
  'supply-chain': { bg: '#1a2e22', color: '#4db87a' },
  mechanical:     { bg: '#1a2a40', color: '#5090e0' },
  firmware:       { bg: '#2a2200', color: '#e09a30' },
  management:     { bg: '#2a1a2e', color: '#c080e0' },
  general:        { bg: '#1e2020', color: '#9a9690' }
};

const PRIORITY_COLORS = {
  critical: { bg: 'rgba(224,85,85,0.2)',   color: '#e05555', label: 'CRITICAL' },
  high:     { bg: 'rgba(224,85,85,0.12)',  color: '#e05555', label: 'HIGH' },
  medium:   { bg: 'rgba(224,154,48,0.15)', color: '#e09a30', label: 'MEDIUM' },
  low:      { bg: 'rgba(77,184,122,0.12)', color: '#4db87a', label: 'LOW' }
};

// Role metadata — drives the header of each digest card
export const ROLE_INFO = {
  me: {
    name:     'Mechanical Engineer',
    subtitle: 'mech-eng · arm-assembly DRI',
    initials: 'ME',
    avatar:   { bg: '#1a2a40', color: '#5090e0' },
    labels:   { blocker: 'Blockers · action required', watch: 'Watch items', positive: 'On track' }
  },
  ee: {
    name:     'Electrical Engineer',
    subtitle: 'electrical · PCB & power systems',
    initials: 'EE',
    avatar:   { bg: '#1a1a2e', color: '#7070e0' },
    labels:   { blocker: 'Blockers · action required', watch: 'Watch items', positive: 'On track' }
  },
  fw: {
    name:     'Firmware Engineer',
    subtitle: 'firmware · controls & integration',
    initials: 'FW',
    avatar:   { bg: '#2a2200', color: '#e09a30' },
    labels:   { blocker: 'Blockers · action required', watch: 'Watch items', positive: 'On track' }
  },
  sc: {
    name:     'Supply Chain Lead',
    subtitle: 'supply-chain · BOM owner',
    initials: 'SC',
    avatar:   { bg: '#1a2e22', color: '#4db87a' },
    labels:   { blocker: 'Blockers · action required', watch: 'Watch items', positive: 'On track' }
  },
  pm: {
    name:     'Product Manager',
    subtitle: 'product · roadmap & delivery',
    initials: 'PM',
    avatar:   { bg: '#1a2a1a', color: '#60c060' },
    labels:   { blocker: 'Decisions needed', watch: 'Delivery risks', positive: 'On track' }
  },
  em: {
    name:     'Engineering Manager',
    subtitle: 'eng-manager · Atlas v2',
    initials: 'EM',
    avatar:   { bg: '#2a1a2e', color: '#c080e0' },
    labels:   { blocker: 'Decisions pending you', watch: 'Team health', positive: 'Velocity signal' }
  }
};

// ── Feed ────────────────────────────────────────────────────────

export function renderMessage(msg, fresh = true, onClick = null) {
  const feed   = document.getElementById('feed');
  const colors = AVATAR_COLORS[msg.user?.role] || AVATAR_COLORS.general;
  const time   = formatTime(msg.ts);

  const el = document.createElement('div');
  el.className = 'msg' + (fresh ? ' fresh' : '');
  el.dataset.msgId = msg.id;
  el.innerHTML = `
    <div class="msg-top">
      <div class="avatar" style="background:${colors.bg};color:${colors.color}">${msg.user?.initials || '?'}</div>
      <span class="msg-name">${msg.user?.name || 'Unknown'}</span>
      <span class="msg-channel">#${msg.channel?.name || 'general'}</span>
      <span class="msg-time">${time}</span>
    </div>
    <div class="msg-text">${msg.text}</div>
  `;
  if (onClick) el.addEventListener('click', onClick);
  feed.appendChild(el);
  feed.scrollTop = feed.scrollHeight;
}

// ── Role digest ──────────────────────────────────────────────────

export function renderRoleDigest(digest, roleId) {
  const body  = document.getElementById('role-digest-body');
  const cross = document.getElementById('role-digest-cross');
  const crossText = document.getElementById('role-digest-cross-text');
  const card  = document.getElementById('role-digest-card');
  const timeEl = document.getElementById('role-digest-time');

  if (card)   card.classList.remove('updating');
  if (timeEl) timeEl.textContent = formatNow();

  const labels = ROLE_INFO[roleId]?.labels || { blocker: 'Blockers', watch: 'Watch', positive: 'On track' };

  if (body) {
    let html = '';
    html += renderSection(digest.blockers, 'var(--red)',   labels.blocker, 'prio-high');
    html += renderSection(digest.watch,    'var(--amber)', labels.watch,   'prio-med');
    html += renderSection(digest.positive, 'var(--green)', labels.positive, 'prio-low');
    body.innerHTML = html || `<div class="gen-state visible" style="color:var(--green)">No priority items right now — team is clear.</div>`;
  }

  if (digest.crossTeam && cross && crossText) {
    crossText.textContent = digest.crossTeam;
    cross.style.display = '';
  }
}

function renderSection(items, color, label, prioClass) {
  if (!items?.length) return '';
  let s = `
    <div class="section">
      <div class="section-header">
        <span class="section-label" style="color:${color}">${label}</span>
        <div class="section-line"></div>
      </div>`;
  items.forEach(item => {
    s += `
      <div class="item">
        <div class="prio-indicator ${prioClass}"></div>
        <div class="item-content">
          <div class="item-text">${item.text}</div>
          <div class="item-why">${item.why}</div>
        </div>
      </div>`;
  });
  return s + `</div>`;
}

// ── Message analysis ─────────────────────────────────────────────

export function renderAnalysis(result, msg) {
  const priority = (result.priority || 'medium').toLowerCase();
  const pColors  = PRIORITY_COLORS[priority] || PRIORITY_COLORS.medium;

  const badge = document.getElementById('analysis-priority-badge');
  if (badge) {
    badge.textContent       = pColors.label;
    badge.style.background  = pColors.bg;
    badge.style.color       = pColors.color;
    badge.style.borderColor = pColors.color + '44';
  }

  const timeEl = document.getElementById('analysis-time');
  if (timeEl) timeEl.textContent = formatNow();

  const body = document.getElementById('analysis-body');
  if (body) {
    const roles = (result.affectedRoles || [])
      .map(r => `<span class="role-tag">${r}</span>`).join('');
    body.innerHTML = `
      <div class="card-body" style="padding:14px 16px;display:flex;flex-direction:column;gap:14px;">
        <div class="analysis-section">
          <div class="analysis-section-label">Summary</div>
          <div class="analysis-section-value">${result.summary || '—'}</div>
          <div class="analysis-reason">${result.priorityReason || ''}</div>
        </div>
        ${result.actionNeeded ? `
        <div class="analysis-section">
          <div class="analysis-section-label">Action needed</div>
          <div class="analysis-section-value">${result.actionNeeded}</div>
        </div>` : ''}
        ${roles ? `
        <div class="analysis-section">
          <div class="analysis-section-label">Affects</div>
          <div class="analysis-roles">${roles}</div>
        </div>` : ''}
      </div>`;
  }

  if (result.suggestedResponse) {
    const wrap = document.getElementById('analysis-response-wrap');
    const text = document.getElementById('analysis-response-text');
    if (wrap) wrap.style.display = '';
    if (text) text.textContent   = result.suggestedResponse;
  }
}

// ── Channel summary ──────────────────────────────────────────────

export function renderChannelSummary(result) {
  const body   = document.getElementById('analysis-body');
  const timeEl = document.getElementById('analysis-time');
  if (timeEl) timeEl.textContent = formatNow();
  if (!body) return;

  const happened = (result.whatHappened || [])
    .map(b => `<div class="item"><div class="prio-indicator prio-med"></div><div class="item-content"><div class="item-text">${b}</div></div></div>`)
    .join('');

  const unresolved = (result.unresolved || [])
    .map(u => `<div class="item"><div class="prio-indicator prio-high"></div><div class="item-content"><div class="item-text">${u}</div></div></div>`)
    .join('');

  body.innerHTML = `
    <div style="padding:14px 16px;display:flex;flex-direction:column;gap:16px;">
      ${result.headline ? `
      <div class="analysis-section">
        <div class="analysis-section-label">Headline</div>
        <div class="analysis-section-value" style="font-size:14px;font-weight:500;">${result.headline}</div>
      </div>` : ''}
      ${happened ? `
      <div class="section">
        <div class="section-header">
          <span class="section-label" style="color:var(--amber)">What happened</span>
          <div class="section-line"></div>
        </div>
        ${happened}
      </div>` : ''}
      ${unresolved ? `
      <div class="section">
        <div class="section-header">
          <span class="section-label" style="color:var(--red)">Still unresolved</span>
          <div class="section-line"></div>
        </div>
        ${unresolved}
      </div>` : ''}
      ${result.keyDecision ? `
      <div class="analysis-section" style="background:rgba(200,240,90,0.05);border:1px solid rgba(200,240,90,0.15);border-radius:6px;padding:10px 12px;">
        <div class="analysis-section-label" style="color:var(--accent)">Key decision needed</div>
        <div class="analysis-section-value">${result.keyDecision}</div>
      </div>` : ''}
    </div>`;
}

// ── Counters & meta ──────────────────────────────────────────────

export function updateMessageCount(count) {
  const el  = document.getElementById('feed-count');
  if (el) el.textContent = count + ' msgs';
  const el2 = document.getElementById('msg-count');
  if (el2) el2.textContent = count;
}

export function updateSourceInfo(lookbackHours, channelCount) {
  const el = document.getElementById('digest-source');
  if (!el) return;
  const hrs   = lookbackHours || 24;
  const label = hrs >= 48 ? Math.round(hrs / 24) + ' days' : hrs + ' hours';
  el.textContent = 'Last ' + label + (channelCount ? ' · ' + channelCount + ' channels' : '');
}

// ── Helpers ──────────────────────────────────────────────────────

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(parseFloat(ts) * 1000);
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

function formatNow() {
  const d = new Date();
  let h   = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + m + ' ' + ampm;
}
