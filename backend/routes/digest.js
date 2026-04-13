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
/**
 * POST /api/digest/summarize-channel
 * Summarize all messages in a channel (or all channels), personalized to the viewer's role.
 * Body: { phase, channel?, personaId?, apiKey? }
 *
 * When personaId is provided, the headline, what happened, unresolved items,
 * and key decision are all filtered through the lens of what that role cares about.
 */
router.post('/summarize-channel', async (req, res) => {
  const { phase, channel, personaId, apiKey } = req.body;
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(401).json({ error: 'No API key configured.' });

  try {
    const Anthropic      = require('@anthropic-ai/sdk');
    const client         = new Anthropic({ apiKey: key });
    const { getMessages } = require('../data/slackMessages');
    const { getPhase }   = require('../data/phases');
    const { getPersona } = require('../data/personas');

    const msgs = channel ? getMessages(channel) : getMessages();
    const messageText = msgs.map(m => `[${m.channel.name}] ${m.user.name}: ${m.text}`).join('\n');

    if (!messageText.trim()) {
      return res.json({
        headline: 'No messages found' + (channel ? ' in #' + channel : '') + '.',
        whatHappened: [], unresolved: [], keyDecision: null
      });
    }

    const phaseObj = getPhase(phase || 'bringup');

    // Resolve persona if provided — personalizes the summary to their discipline
    const persona = personaId ? (() => { try { return getPersona(personaId); } catch { return null; } })() : null;

    const roleContext = persona
      ? `\nYOU ARE SUMMARIZING FOR: ${persona.name}\nROLE CONTEXT: ${persona.role}\nFocus the headline, what happened, unresolved items, and key decision on what is most relevant to this role. A supply chain lead needs sourcing and BOM risks. A firmware engineer needs hardware blockers and integration failures. A manager needs cross-team decisions and schedule risk. Filter out noise that doesn't affect this role.`
      : '';

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: `You are a concise summarizer for a robotics hardware engineering team's Slack activity.
You always return valid JSON with no markdown, no backticks, no preamble.`,
      messages: [{
        role: 'user',
        content: `PHASE: ${phaseObj.context}
${roleContext}

SLACK MESSAGES:
${messageText}

Summarize this Slack activity${persona ? ` for a ${persona.name}` : ''}. Return ONLY valid JSON:
{
  "headline": "one sentence capturing the most important thing for ${persona ? persona.name : 'the team'} right now, under 15 words",
  "whatHappened": ["2-4 bullet points of key events relevant to ${persona ? persona.name : 'the team'}, each under 18 words"],
  "unresolved": ["1-3 open questions or blockers that affect ${persona ? persona.name : 'the team'}, each under 15 words"],
  "keyDecision": "the single most important decision or action for ${persona ? persona.name : 'the team'} to take, or null if none"
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
 * Analyze a single Slack message, personalized to the viewer's role.
 * Body: { message: { text, user, channel }, phase, personaId, apiKey }
 *
 * personaId is optional — if omitted, analysis is generic.
 * When provided, Claude tailors the action and suggested response
 * specifically to what that role cares about.
 */
router.post('/analyze', async (req, res) => {
  const { message, phase, personaId, apiKey } = req.body;

  if (!message?.text) {
    return res.status(400).json({ error: 'message.text is required' });
  }

  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(401).json({ error: 'No API key. Set ANTHROPIC_API_KEY in .env.' });
  }

  try {
    const { analyzeMessage } = require('../services/digestService');
    const { getPersona }     = require('../data/personas');

    // Resolve persona if provided — used to personalize the analysis
    const persona = personaId ? (() => { try { return getPersona(personaId); } catch { return null; } })() : null;

    const result = await analyzeMessage(message, phase || 'bringup', key, persona);
    res.json(result);
  } catch (err) {
    console.error('[digest/analyze] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
