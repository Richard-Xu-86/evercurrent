/**
 * routes/messages.js
 *
 * Endpoints for the Slack message feed.
 *
 * In production, the POST /api/messages and /preset routes would be replaced by:
 *   - A Slack Events API webhook (POST /api/slack/events) for real-time messages
 *   - A scheduled polling service using Slack's conversations.history API
 *
 * The message shape used here mirrors the Slack API format so that swap is seamless.
 *
 * GET  /api/messages         — Fetch all messages (optionally filtered by channel)
 * POST /api/messages         — Add a custom message to the feed
 * POST /api/messages/preset  — Inject a realistic demo scenario message
 * POST /api/messages/reset   — Wipe the feed back to empty (useful for demos)
 */

const express = require('express');
const router = express.Router();
const { getMessages, addMessage, resetMessages } = require('../data/slackMessages');

// Preset demo messages — realistic hardware team scenarios for testing/demo purposes.
// These can be injected via POST /api/messages/preset with a { key } body.
const PRESETS = {
  supply: {
    user:    { id: 'U001', name: 'Supply Chain Lead', initials: 'SC', role: 'supply-chain' },
    channel: { id: 'C001', name: 'supply-chain' },
    text: 'Encoder supplier confirmed 6-week lead time on the AS5047P. We need a qualified alternative sourced by Monday or we slip the BOM freeze.'
  },
  firmware: {
    user:    { id: 'U003', name: 'Firmware Engineer', initials: 'FW', role: 'firmware' },
    channel: { id: 'C003', name: 'firmware' },
    text: 'Torque control loop oscillating on joint 2 at 60%+ load. Could be PID tuning or mechanical resonance — need mechanical to confirm the joint stiffness spec.'
  },
  manager: {
    user:    { id: 'U004', name: 'Engineering Manager', initials: 'EM', role: 'management' },
    channel: { id: 'C005', name: 'general' },
    text: 'Assigning a DRI on the joint 5 re-design. Need updated drawings and a revised tolerance report by Wednesday EOD.'
  },
  mechanical: {
    user:    { id: 'U002', name: 'Mechanical Engineer', initials: 'ME', role: 'mechanical' },
    channel: { id: 'C002', name: 'mechanical' },
    text: 'Proposing forearm bracket material change from Al 6061 to Al 7075 for higher yield strength. Impacts weight budget by +40g and may require a BOM update.'
  }
};

// GET /api/messages
router.get('/', (req, res) => {
  const { channel } = req.query;
  res.json({ messages: getMessages(channel || null) });
});

// POST /api/messages — add a custom message
router.post('/', (req, res) => {
  const { user, channel, text } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  const msg = addMessage({
    user: user || { id: 'U_custom', name: 'Team Member', initials: 'TM', role: 'general' },
    channel: channel || { id: 'C_general', name: 'general' },
    text
  });

  res.status(201).json({ message: msg });
});

// POST /api/messages/preset — inject a preset scenario
router.post('/preset', (req, res) => {
  const { key } = req.body;
  const preset = PRESETS[key];
  if (!preset) {
    return res.status(400).json({ error: `Unknown preset: ${key}. Options: ${Object.keys(PRESETS).join(', ')}` });
  }

  const msg = addMessage(preset);
  res.status(201).json({ message: msg, preset: key });
});

// POST /api/messages/reset
router.post('/reset', (req, res) => {
  resetMessages();
  res.json({ ok: true, messages: getMessages() });
});

module.exports = router;
