/**
 * routes/slack.js
 *
 * Endpoints for Slack ingestion control.
 *
 * POST /api/slack/ingest
 *   Manually trigger a Slack message pull.
 *   In production this would also be called by a scheduled cron job.
 *
 * GET /api/slack/status
 *   Returns current connection status and last ingestion time.
 *
 * POST /api/slack/events  (future)
 *   Slack Events API webhook — would receive real-time message events.
 *   Requires a publicly accessible URL (e.g. via ngrok or deployment).
 */

const express = require('express');
const router = express.Router();
const { ingestSlackMessages } = require('../services/slackIngestion');

// Track ingestion state
const state = {
  lastIngestion: null,
  lastCount: 0,
  lastChannels: [],
  error: null,
  connected: false
};

/**
 * POST /api/slack/ingest
 * Triggers a fresh pull from Slack. Accepts optional botToken in body
 * (falls back to SLACK_BOT_TOKEN env var).
 */
router.post('/ingest', async (req, res) => {
  const token = req.body?.botToken || process.env.SLACK_BOT_TOKEN;

  if (!token || token === 'xoxb-your-token-here') {
    return res.status(400).json({
      error: 'No Slack bot token configured.',
      hint: 'Set SLACK_BOT_TOKEN in .env or pass botToken in the request body.'
    });
  }

  try {
    const summary = await ingestSlackMessages(token);
    state.lastIngestion = new Date().toISOString();
    state.lastCount = summary.messageCount;
    state.lastChannels = summary.channels;
    state.error = null;
    state.connected = true;

    res.json({
      ok: true,
      ...summary,
      ingestedAt: state.lastIngestion
    });
  } catch (err) {
    state.error = err.message;
    state.connected = false;
    console.error('[slack/ingest] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/slack/status
 */
router.get('/status', (req, res) => {
  const hasToken = !!(process.env.SLACK_BOT_TOKEN && process.env.SLACK_BOT_TOKEN !== 'xoxb-your-token-here');
  res.json({
    configured: hasToken,
    connected: state.connected,
    lastIngestion: state.lastIngestion,
    lastCount: state.lastCount,
    lastChannels: state.lastChannels,
    error: state.error
  });
});

/**
 * POST /api/slack/reply
 * Send a message to a Slack channel, optionally as a thread reply.
 * Body: { channelId, text, threadTs? }
 */
router.post('/reply', async (req, res) => {
  const { channelId, text, threadTs } = req.body;

  if (!channelId || !text) {
    return res.status(400).json({ error: 'channelId and text are required' });
  }

  const token = process.env.SLACK_BOT_TOKEN;
  if (!token || token === 'xoxb-your-token-here') {
    return res.status(400).json({ error: 'SLACK_BOT_TOKEN not configured in .env' });
  }

  try {
    const { WebClient } = require('@slack/web-api');
    const client = new WebClient(token);

    const payload = { channel: channelId, text };
    if (threadTs) payload.thread_ts = threadTs;

    const result = await client.chat.postMessage(payload);
    res.json({ ok: true, ts: result.ts, channel: result.channel });
  } catch (err) {
    console.error('[slack/reply] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/slack/events
 * Placeholder for real-time Slack Events API webhook.
 * Slack sends a POST here whenever a message is sent in a monitored channel.
 *
 * To activate:
 *   1. Deploy app to a public URL (or use ngrok: `ngrok http 3000`)
 *   2. In Slack App settings → Event Subscriptions → Request URL: https://your-url/api/slack/events
 *   3. Subscribe to: message.channels, message.groups
 */
router.post('/events', express.raw({ type: 'application/json' }), async (req, res) => {
  let body;
  try {
    body = JSON.parse(req.body);
  } catch {
    return res.status(400).send('Bad request');
  }

  // Slack URL verification challenge (required when first setting up)
  if (body.type === 'url_verification') {
    return res.json({ challenge: body.challenge });
  }

  // Handle incoming message events
  if (body.event?.type === 'message' && !body.event?.subtype) {
    const event = body.event;
    console.log(`[slack/events] New message in <#${event.channel}>: ${event.text?.slice(0, 60)}...`);

    // In a full implementation:
    // 1. Verify the request signature using SLACK_SIGNING_SECRET
    // 2. Add the message to the store
    // 3. Trigger a digest re-generation for affected personas
    // 4. Push the update to connected clients via SSE or WebSocket
  }

  res.status(200).send('OK');
});

module.exports = router;
