/**
 * js/api.js
 *
 * Thin API client — all fetch calls to the backend live here.
 * The rest of the frontend (app.js, ui.js) imports from this module.
 */

const API_BASE = '';

/**
 * Get all messages in the feed
 */
async function fetchMessages() {
  const res = await fetch(`${API_BASE}/api/messages`);
  if (!res.ok) throw new Error('Failed to fetch messages');
  return res.json();
}

/**
 * Post a custom message
 */
async function postMessage(text, channelName = 'general') {
  const res = await fetch(`${API_BASE}/api/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      user: { id: 'U_you', name: 'You', initials: 'ME', role: 'general' },
      channel: { id: 'C_gen', name: channelName }
    })
  });
  if (!res.ok) throw new Error('Failed to post message');
  return res.json();
}

/**
 * Inject a preset scenario message
 */
async function postPreset(key) {
  const res = await fetch(`${API_BASE}/api/messages/preset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key })
  });
  if (!res.ok) throw new Error(`Failed to inject preset: ${key}`);
  return res.json();
}

/**
 * Reset messages to seed data
 */
async function resetMessages() {
  const res = await fetch(`${API_BASE}/api/messages/reset`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to reset messages');
  return res.json();
}

/**
 * Generate a digest for a single persona
 * @param {string} phase - 'design' | 'bringup' | 'manufacturing'
 * @param {string} personaId - 'me' | 'sc' | 'em'
 * @param {string} apiKey - optional, overrides server .env key
 */
async function generateDigestSingle(phase, personaId, apiKey = null) {
  const body = { phase, personaId };
  if (apiKey) body.apiKey = apiKey;

  const res = await fetch(`${API_BASE}/api/digest/single`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Digest generation failed');
  return data;
}

/**
 * Get persona metadata
 */
async function fetchPersonas() {
  const res = await fetch(`${API_BASE}/api/personas`);
  if (!res.ok) throw new Error('Failed to fetch personas');
  return res.json();
}

/**
 * Get phase metadata
 */
async function fetchPhases() {
  const res = await fetch(`${API_BASE}/api/phases`);
  if (!res.ok) throw new Error('Failed to fetch phases');
  return res.json();
}

/**
 * Trigger a live Slack ingestion pull
 * @param {string} botToken - optional, overrides SLACK_BOT_TOKEN env var
 */
async function ingestSlack(botToken = null) {
  const body = botToken ? { botToken } : {};
  const res = await fetch(`${API_BASE}/api/slack/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Slack ingestion failed');
  return data;
}

/**
 * Get Slack connection status
 */
async function fetchSlackStatus() {
  const res = await fetch(`${API_BASE}/api/slack/status`);
  if (!res.ok) throw new Error('Failed to fetch Slack status');
  return res.json();
}

/**
 * Analyze a single Slack message
 */
async function analyzeMessage(message, phase, apiKey = null) {
  const body = { message, phase };
  if (apiKey) body.apiKey = apiKey;

  const res = await fetch(`${API_BASE}/api/digest/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Analysis failed');
  return data;
}

/**
 * Reply to a Slack message in its thread
 * @param {string} channelId - Slack channel ID (e.g. C01234)
 * @param {string} text - message text to send
 * @param {string} threadTs - timestamp of the parent message (for thread reply)
 */
async function replyToSlack(channelId, text, threadTs) {
  const res = await fetch(`${API_BASE}/api/slack/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelId, text, threadTs })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to send Slack reply');
  return data;
}

async function summarizeChannel(phase, apiKey = null, channel = null) {
  const body = { phase };
  if (apiKey)   body.apiKey  = apiKey;
  if (channel)  body.channel = channel;
  const res  = await fetch(`${API_BASE}/api/digest/summarize-channel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Summarization failed');
  return data;
}

export { fetchMessages, postMessage, postPreset, resetMessages, generateDigestSingle, analyzeMessage, replyToSlack, summarizeChannel, fetchPersonas, fetchPhases, ingestSlack, fetchSlackStatus };
