/**
 * routes/digest.js
 *
 * REST endpoints for digest generation.
 *
 * POST /api/digest
 *   Generate a digest for one or more personas based on current messages + phase.
 *
 * POST /api/digest/single
 *   Generate a digest for a single persona (used when a new message arrives
 *   and only affected personas need refreshing).
 */

const express = require('express');
const router = express.Router();
const { generateAllDigests, generateDigest } = require('../services/digestService');
const { formatForPrompt } = require('../data/slackMessages');
const { getPersona } = require('../data/personas');
const { getPhase } = require('../data/phases');

/**
 * POST /api/digest
 * Body: { phase: string, personas: string[], apiKey: string }
 * Returns: { digests: { [personaId]: DigestObject } }
 */
router.post('/', async (req, res) => {
  const { phase, personas, apiKey } = req.body;

  if (!phase || !personas || !Array.isArray(personas)) {
    return res.status(400).json({ error: 'phase and personas[] are required' });
  }

  if (!apiKey && !process.env.ANTHROPIC_API_KEY) {
    return res.status(401).json({ error: 'No API key provided. Set ANTHROPIC_API_KEY in .env or pass apiKey in request body.' });
  }

  try {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    const messageText = formatForPrompt();
    const digests = await generateAllDigests(phase, messageText, key, personas);
    res.json({ digests, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[digest] Generation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/digest/single
 * Body: { phase: string, personaId: string, apiKey: string }
 * Returns: { personaId, digest: DigestObject }
 */
router.post('/single', async (req, res) => {
  const { phase, personaId, apiKey } = req.body;

  if (!phase || !personaId) {
    return res.status(400).json({ error: 'phase and personaId are required' });
  }

  try {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    const persona = getPersona(personaId);
    const phaseObj = getPhase(phase);
    const messageText = formatForPrompt();
    const digest = await generateDigest(persona, phaseObj, messageText, key);
    res.json({ personaId, digest, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[digest/single] Generation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/digest/summarize-channel
 * Summarize all messages in the feed — what happened, key decisions, what's unresolved.
 * Body: { phase, apiKey }
 */
router.post('/summarize-channel', async (req, res) => {
  const { phase, apiKey } = req.body;
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(401).json({ error: 'No API key configured.' });

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: key });
    const { formatForPrompt } = require('../data/slackMessages');
    const { getPhase } = require('../data/phases');

    const { channel } = req.body;
    const { getMessages } = require('../data/slackMessages');
    const msgs = channel ? getMessages(channel) : getMessages();
    const messageText = msgs.map(m => `[${m.channel.name}] ${m.user.name}: ${m.text}`).join('\n');

    if (!messageText.trim()) {
      return res.json({
        headline: 'No messages found' + (channel ? ' in #' + channel : '') + '.',
        whatHappened: [], unresolved: [], keyDecision: null
      });
    }

    const phaseObj = getPhase(phase || 'bringup');

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: `You are a concise summarizer for a robotics hardware engineering team's Slack activity.
You always return valid JSON with no markdown, no backticks, no preamble.`,
      messages: [{
        role: 'user',
        content: `PHASE: ${phaseObj.context}

SLACK MESSAGES:
${messageText}

Summarize this channel activity. Return ONLY valid JSON:
{
  "headline": "one sentence capturing the most important thing happening right now, under 15 words",
  "whatHappened": ["2-4 bullet points of key events or updates, each under 18 words"],
  "unresolved": ["1-3 open questions or blockers still needing action, each under 15 words"],
  "keyDecision": "the single most important decision or action the team needs to take, or null if none"
}`
      }]
    });

    const raw = response.content.map(c => c.type === 'text' ? c.text : '').join('');
    const result = JSON.parse(raw.replace(/```json|```/g, '').trim());
    res.json(result);
  } catch (err) {
    console.error('[digest/summarize-channel]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/digest/analyze
 * Analyze a single Slack message — summary, priority, suggested response, affected roles.
 * Body: { message: { text, user, channel }, phase, apiKey }
 */
router.post('/analyze', async (req, res) => {
  const { message, phase, apiKey } = req.body;

  if (!message?.text) {
    return res.status(400).json({ error: 'message.text is required' });
  }

  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(401).json({ error: 'No API key. Set ANTHROPIC_API_KEY in .env.' });
  }

  try {
    const { analyzeMessage } = require('../services/digestService');
    const result = await analyzeMessage(message, phase || 'bringup', key);
    res.json(result);
  } catch (err) {
    console.error('[digest/analyze] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
