/**
 * js/app.js — EverCurrent Daily Digest
 * Role-based digest + per-message analysis
 */

import { fetchMessages, postMessage, postPreset, ingestSlack,
         fetchSlackStatus, analyzeMessage, replyToSlack,
         generateDigestSingle, summarizeChannel } from './api.js';
import * as UI from './ui.js';

function formatDate(d) {
  const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return days[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate();
}

// ── State ──────────────────────────────────────────────────────
const state = {
  phase:        'bringup',
  role:         localStorage.getItem('ec_my_role') || null,
  apiKey:       localStorage.getItem('ec_api_key') || '',
  messageCount: 0,
  selectedMsg:  null,
  allMessages:  []   // full unfiltered message list — used when filtering feed by channel
};

// ── Slack sync ─────────────────────────────────────────────────
window.handleSlackSync = async function() {
  const btn   = document.getElementById('slack-sync-btn');
  const label = document.getElementById('slack-sync-label');
  if (!btn || btn.classList.contains('syncing')) return;

  btn.classList.add('syncing');
  label.textContent = '⟳ Syncing...';

  try {
    const result = await ingestSlack();
    const feedEl = document.getElementById('feed');
    if (feedEl) feedEl.innerHTML = '';

    const { messages } = await fetchMessages();
    state.allMessages = messages;
    messages.forEach(m => UI.renderMessage(m, false, () => handleMessageClick(m)));
    state.messageCount = messages.length;
    UI.updateMessageCount(state.messageCount);
    UI.updateSourceInfo(result.lookbackHours, result.channelsFetched);
    populateChannelFilter(messages);

    btn.classList.remove('syncing');
    btn.classList.add('connected');
    label.textContent = '✓ ' + result.messageCount + ' msgs · ' + result.channelsFetched + ' channels';

    // Re-generate digest if a role is already selected
    if (state.role) generateRoleDigest();

    setTimeout(() => { label.textContent = '⟳ Sync Slack'; btn.classList.remove('connected'); }, 4000);
  } catch (err) {
    btn.classList.remove('syncing');
    label.textContent = '✗ ' + (err.message.includes('token') ? 'Set SLACK_BOT_TOKEN in .env' : err.message.slice(0, 28));
    setTimeout(() => { label.textContent = '⟳ Sync Slack'; }, 4000);
  }
};

// ── Init ───────────────────────────────────────────────────────
async function init() {
  const dateEl = document.getElementById('digest-date');
  if (dateEl) dateEl.textContent = formatDate(new Date());

  const keyInput = document.getElementById('api-key');
  if (keyInput && state.apiKey) keyInput.value = state.apiKey;

  try {
    const status = await fetchSlackStatus();
    if (status.connected && status.lastCount > 0) {
      const btn   = document.getElementById('slack-sync-btn');
      const label = document.getElementById('slack-sync-label');
      if (btn)   btn.classList.add('connected');
      if (label) label.textContent = '✓ ' + status.lastCount + ' Slack msgs';
      UI.updateSourceInfo(null, status.lastChannels?.length);
      setTimeout(() => {
        if (label) label.textContent = '⟳ Sync Slack';
        if (btn)   btn.classList.remove('connected');
      }, 5000);
    }
  } catch {}

  try {
    const { messages } = await fetchMessages();
    state.allMessages = messages;
    messages.forEach(m => UI.renderMessage(m, false, () => handleMessageClick(m)));
    state.messageCount = messages.length;
    UI.updateMessageCount(state.messageCount);
    populateChannelFilter(messages);
  } catch (err) {
    console.error('Failed to load messages:', err);
  }

  document.getElementById('send-btn')?.addEventListener('click', handleSend);
  document.getElementById('msg-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSend();
  });

  document.getElementById('api-key')?.addEventListener('change', e => {
    state.apiKey = e.target.value.trim();
    localStorage.setItem('ec_api_key', state.apiKey);
  });

  // Restore saved role and auto-generate digest
  if (state.role) {
    const savedBtn = document.querySelector(`.my-role-btn[data-role="${state.role}"]`);
    if (savedBtn) {
      savedBtn.classList.add('active');
      generateRoleDigest();
    }
  }
}

// ── Phase change ───────────────────────────────────────────────
window.onPhaseChange = function(phase) {
  state.phase = phase;

  const labels = {
    design:        'Design phase · Week 1',
    bringup:       'Bring-up phase · Week 3 of 6',
    manufacturing: 'Manufacturing phase · Week 1'
  };
  const labelEl = document.getElementById('phase-label-text');
  if (labelEl) labelEl.textContent = labels[phase] || phase;

  // Re-generate if a role is active
  if (state.role) generateRoleDigest();
  // Re-analyze if a message is selected
  else if (state.selectedMsg) handleMessageClick(state.selectedMsg);
};

// ── Role selection ─────────────────────────────────────────────
window.setRole = function(roleId, btn) {
  document.querySelectorAll('.my-role-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.role = roleId;
  localStorage.setItem('ec_my_role', roleId);

  // Hide message analysis, show digest
  document.getElementById('analysis-card').style.display = 'none';
  document.getElementById('analysis-empty').style.display = 'none';
  document.querySelectorAll('.msg').forEach(el => el.classList.remove('selected'));
  state.selectedMsg = null;

  generateRoleDigest();
};

// ── Role digest generation ─────────────────────────────────────
async function generateRoleDigest() {
  if (!state.role) return;

  const card = document.getElementById('role-digest-card');
  const body = document.getElementById('role-digest-body');
  const cross = document.getElementById('role-digest-cross');
  const header = document.getElementById('role-digest-header');

  card.style.display = '';
  cross.style.display = 'none';
  card.classList.add('updating');

  // Render header with role info
  const roleInfo = UI.ROLE_INFO[state.role];
  if (header && roleInfo) {
    header.innerHTML = `
      <div class="persona-avatar" style="background:${roleInfo.avatar.bg};color:${roleInfo.avatar.color}">${roleInfo.initials}</div>
      <div class="persona-info">
        <div class="persona-name">${roleInfo.name}</div>
        <div class="persona-role">${roleInfo.subtitle}</div>
      </div>
      <div class="card-header-right">
        <span class="card-time" id="role-digest-time"></span>
        <span class="phase-badge" id="role-digest-badge">${state.phase === 'bringup' ? 'bring-up' : state.phase}</span>
      </div>`;
  }

  body.innerHTML = `
    <div class="gen-state visible">
      <div class="gen-spinner"></div>
      <span>Generating ${roleInfo?.name || 'role'} digest…</span>
    </div>`;

  try {
    const { digest } = await generateDigestSingle(state.phase, state.role, state.apiKey || null);
    UI.renderRoleDigest(digest, state.role);
  } catch (err) {
    body.innerHTML = `<div class="error-note">⚠ ${
      err.message.includes('API key')
        ? 'Set ANTHROPIC_API_KEY in .env or enter key above'
        : err.message
    }</div>`;
    card.classList.remove('updating');
  }
}

// ── Channel filter population ──────────────────────────────────
function populateChannelFilter(messages) {
  const select = document.getElementById('channel-filter');
  if (!select) return;

  const channels = [...new Set(messages.map(m => m.channel?.name).filter(Boolean))].sort();
  // Keep the "All channels" option, rebuild the rest
  select.innerHTML = '<option value="">All channels</option>';
  channels.forEach(ch => {
    const opt = document.createElement('option');
    opt.value = ch;
    opt.textContent = '#' + ch;
    select.appendChild(opt);
  });

  // Wire dropdown change to filter the feed
  select.onchange = () => filterFeed(select.value);
}

// ── Feed filter by channel ─────────────────────────────────────
// Re-renders only the messages that match the selected channel.
// "All channels" (empty string) shows everything.
function filterFeed(channelName) {
  const feed = document.getElementById('feed');
  if (!feed) return;

  feed.innerHTML = '';

  const filtered = channelName
    ? state.allMessages.filter(m => m.channel?.name === channelName)
    : state.allMessages;

  filtered.forEach(m => UI.renderMessage(m, false, () => handleMessageClick(m)));

  // Update the visible count to reflect the filtered set
  const countEl = document.getElementById('feed-count');
  if (countEl) {
    countEl.textContent = channelName
      ? filtered.length + ' msgs · #' + channelName
      : state.allMessages.length + ' msgs';
  }
}

// ── Summarize channel ──────────────────────────────────────────
window.summarizeChannel = async function() {
  const btn        = document.getElementById('summarize-channel-btn');
  const channelVal = document.getElementById('channel-filter')?.value || '';
  const channelLabel = channelVal ? '#' + channelVal : 'All channels';

  btn.disabled = true;
  btn.textContent = 'Summarizing…';

  document.getElementById('analysis-empty').style.display    = 'none';
  document.getElementById('role-digest-card').style.display  = 'none';
  const card = document.getElementById('analysis-card');
  card.style.display = '';

  document.getElementById('analysis-channel').textContent         = channelLabel;
  document.getElementById('analysis-from').textContent            = '';
  document.getElementById('analysis-original').style.display      = 'none'; // no original message for channel summary
  document.getElementById('analysis-original').textContent        = '';
  document.getElementById('analysis-time').textContent            = '';
  document.getElementById('analysis-priority-badge').textContent  = 'SUMMARY';
  document.getElementById('analysis-priority-badge').style.background = 'rgba(200,240,90,0.12)';
  document.getElementById('analysis-priority-badge').style.color  = 'var(--accent)';
  document.getElementById('analysis-priority-badge').style.borderColor = 'rgba(200,240,90,0.3)';
  document.getElementById('analysis-response-wrap').style.display = 'none';
  document.querySelector('.back-btn').style.display = state.role ? '' : 'none';

  document.getElementById('analysis-body').innerHTML = `
    <div class="gen-state visible">
      <div class="gen-spinner"></div>
      <span>Summarizing ${channelLabel}…</span>
    </div>`;

  try {
    const result = await summarizeChannel(state.phase, state.role, state.apiKey || null, channelVal || null);
    UI.renderChannelSummary(result);
  } catch (err) {
    document.getElementById('analysis-body').innerHTML =
      `<div class="error-note">⚠ ${err.message}</div>`;
  }

  btn.disabled = false;
  btn.textContent = 'Summarize';
};

// ── Daily digest button ────────────────────────────────────────
window.triggerDailyDigest = async function() {
  if (!state.role) {
    const sub = document.getElementById('daily-digest-sub');
    if (sub) {
      sub.textContent = '⚠ Select your role first (above the digest panel)';
      sub.style.color = 'var(--amber)';
      setTimeout(() => {
        sub.textContent = 'Summarizes today\'s Slack activity for your role';
        sub.style.color = '';
      }, 3000);
    }
    return;
  }

  const btn   = document.getElementById('daily-digest-btn');
  const label = document.getElementById('daily-digest-label');
  const sub   = document.getElementById('daily-digest-sub');

  btn.disabled = true;
  btn.classList.add('loading');
  label.textContent = 'Generating your digest…';
  sub.textContent   = 'Analyzing Slack activity for ' + (UI.ROLE_INFO[state.role]?.name || state.role);

  // Switch right panel to show digest
  document.getElementById('analysis-card').style.display  = 'none';
  document.getElementById('analysis-empty').style.display = 'none';

  await generateRoleDigest();

  btn.disabled = false;
  btn.classList.remove('loading');
  label.textContent = '◈ Regenerate My Digest';
  sub.textContent   = 'Last generated at ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// ── Back to digest ─────────────────────────────────────────────
window.backToDigest = function() {
  document.getElementById('analysis-card').style.display = 'none';
  document.querySelectorAll('.msg').forEach(el => el.classList.remove('selected'));
  state.selectedMsg = null;

  if (state.role) {
    document.getElementById('role-digest-card').style.display = '';
  } else {
    document.getElementById('analysis-empty').style.display = '';
  }
};

// ── Message send ───────────────────────────────────────────────
// Posts the message to the selected Slack channel via the Slack API,
// then adds it to the local feed so it appears immediately without needing a sync.
async function handleSend() {
  const input      = document.getElementById('msg-input');
  const text       = input?.value.trim();
  if (!text) return;

  // Read which channel is selected in the dropdown — fall back to 'general'
  const channelName = document.getElementById('channel-filter')?.value || 'general';

  input.value = '';

  try {
    // Look up the Slack channel ID from existing messages (Slack API needs the ID not the name)
    const match     = state.allMessages.find(m => m.channel?.name === channelName);
    const channelId = match?.channel?.id || channelName;

    // Post to Slack first — this is the real send
    await replyToSlack(channelId, text, null);

    // Also add to local feed so it shows up immediately without a full sync
    const { message } = await postMessage(text, channelName);
    UI.renderMessage(message, true, () => handleMessageClick(message));
    state.allMessages.push(message);
    state.messageCount++;
    UI.updateMessageCount(state.messageCount);
  } catch (err) {
    console.error('Failed to send message:', err);
  }
}

// ── Preset inject ──────────────────────────────────────────────
window.sendPreset = async function(key) {
  try {
    const { message } = await postPreset(key);
    UI.renderMessage(message, true, () => handleMessageClick(message));
    state.messageCount++;
    UI.updateMessageCount(state.messageCount);
  } catch (err) {
    console.error('Failed to inject preset:', err);
  }
};

// ── Click-to-analyze ───────────────────────────────────────────
async function handleMessageClick(msg) {
  document.querySelectorAll('.msg').forEach(el => el.classList.remove('selected'));
  const el = document.querySelector(`[data-msg-id="${msg.id}"]`);
  if (el) el.classList.add('selected');
  state.selectedMsg = msg;

  // Switch to analysis view
  document.getElementById('analysis-empty').style.display = 'none';
  document.getElementById('role-digest-card').style.display = 'none';

  const card = document.getElementById('analysis-card');
  card.style.display = '';

  document.getElementById('analysis-channel').textContent   = '#' + (msg.channel?.name || 'general');
  document.getElementById('analysis-from').textContent      = msg.user?.name || '';
  const origEl = document.getElementById('analysis-original');
  origEl.textContent    = msg.text;
  origEl.style.display  = ''; // restore visibility for individual message analysis
  document.getElementById('analysis-time').textContent     = '';
  document.getElementById('analysis-priority-badge').textContent  = '…';
  document.getElementById('analysis-priority-badge').style.background = '';
  document.getElementById('analysis-priority-badge').style.color = '';
  document.getElementById('analysis-response-wrap').style.display = 'none';

  // Show back button only if a role digest exists
  const backBtn = document.querySelector('.back-btn');
  if (backBtn) backBtn.style.display = state.role ? '' : 'none';

  document.getElementById('analysis-body').innerHTML = `
    <div class="gen-state visible">
      <div class="gen-spinner"></div>
      <span>Analyzing message…</span>
    </div>`;

  try {
    const result = await analyzeMessage(msg, state.phase, state.role, state.apiKey || null);
    UI.renderAnalysis(result, msg);
  } catch (err) {
    document.getElementById('analysis-body').innerHTML =
      `<div class="error-note">⚠ ${err.message.includes('API key') ? 'Set ANTHROPIC_API_KEY in .env or enter key above' : err.message}</div>`;
  }
}

// ── Copy / Reply ───────────────────────────────────────────────
window.copyResponse = function() {
  const text = document.getElementById('analysis-response-text')?.textContent;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copy-btn');
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
  });
};

window.replyInSlack = async function() {
  const msg  = state.selectedMsg;
  const text = document.getElementById('analysis-response-text')?.textContent?.trim();
  if (!msg || !text) return;

  const btn   = document.getElementById('reply-btn');
  const label = document.getElementById('reply-btn-label');
  btn.disabled = true;
  label.textContent = '↩ Sending…';

  try {
    await replyToSlack(msg.channel.id, text, msg.ts);
    label.textContent = '✓ Sent';
    btn.classList.add('sent');
    setTimeout(() => {
      label.textContent = '↩ Reply in Slack';
      btn.classList.remove('sent');
      btn.disabled = false;
    }, 3000);
  } catch (err) {
    label.textContent = '✗ ' + err.message.slice(0, 30);
    btn.disabled = false;
    setTimeout(() => { label.textContent = '↩ Reply in Slack'; }, 4000);
  }
};

// ── Boot ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
