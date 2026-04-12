/**
 * services/digestService.js
 *
 * Core AI service responsible for generating personalized digests.
 *
 * Architecture note:
 * In production this service would be triggered by:
 *   1. A scheduled cron job (e.g. every morning at 8 AM per timezone)
 *   2. A real-time event when a high-priority Slack message arrives
 *   3. An on-demand request from the user
 *
 * The service is stateless — it takes messages + persona + phase
 * and returns a structured digest. Caching, storage, and delivery
 * are handled by the calling layer.
 */

const Anthropic = require('@anthropic-ai/sdk');
const { getPhase } = require('../data/phases');

/**
 * Build the system prompt that shapes Claude's behavior
 */
function buildSystemPrompt() {
  return `You are an AI digest generator embedded in EverCurrent, a platform for robotics hardware engineering teams.

Your job is to read raw Slack messages and produce a structured, personalized digest for a specific team member based on their role.

CRITICAL: Every digest must feel written specifically for that person's job function. The same Slack message should produce completely different action items for different roles. Examples:
- A motor controller lead time issue:
  → Supply Chain: "Source qualified alternative suppliers for motor controller by Thursday"
  → Mechanical: "Assess if motor controller swap affects mounting geometry on joint 4"
  → Firmware: "Confirm new controller's API is compatible with current torque control loop"
  → Electrical: "Verify alternative controller meets power budget and PCB footprint specs"
  → Manager: "Decision needed: approve alternative supplier or delay BOM freeze"
  → Product: "8-week lead time risks ship date — assess if schedule buffer is sufficient"

Role-specific priorities:
- Mechanical engineers: fabrication sign-offs, tolerance specs, physical assembly blockers
- Electrical engineers: PCB impacts, power budgets, component footprints, signal integrity
- Firmware engineers: test failures, hardware API changes, integration blockers
- Supply chain: lead times, BOM freeze deadlines, qualified alternatives, cost impacts
- Product managers: schedule risk, customer commitments, scope trade-offs, go/no-go decisions
- Engineering managers: cross-team blockers, decisions only they can make, team velocity

Phase priorities:
- Design: open decisions, spec risk, requirements clarity
- Bring-up: test failures, cross-team blockers, schedule pressure
- Manufacturing: yield, rework risk, late-stage changes

You always return valid JSON with no markdown, no backticks, no preamble.`;
}

/**
 * Build the user prompt for a specific persona + phase + messages
 */
function buildUserPrompt(persona, phase, messageText) {
  return `PROJECT: Atlas Robot v2
PHASE: ${phase.context}

SLACK MESSAGES (last 24 hours):
${messageText}

GENERATE DIGEST FOR: ${persona.name}
ROLE CONTEXT: ${persona.role}

Return ONLY a valid JSON object with this exact structure:
{
  "blockers": [
    { "text": "specific action only THIS role can take, under 22 words", "why": "flagged because: reason under 12 words" }
  ],
  "watch": [
    { "text": "specific thing to monitor relevant to THIS role, under 22 words", "why": "surfaced because: reason under 12 words" }
  ],
  "positive": [
    { "text": "positive signal relevant to THIS role, under 20 words", "why": "context under 10 words" }
  ],
  "crossTeam": "one sentence about what another team is doing that THIS role needs to know, under 22 words"
}

Critical rules:
- Every item must be actionable and specific to this person's job function — not generic observations
- blockers: 1-3 items. Each must describe what THIS person specifically needs to do or decide. Empty array if none.
- watch: 1-2 items. Things that could become blockers for THIS role specifically. Empty array if none.
- positive: 0-1 items. Only if genuinely relevant to THIS role's work. Empty array if none.
- crossTeam: always present. Name the other team and explain the direct impact on THIS role's work.
- Mechanical engineers get fabrication/tolerance actions. Supply chain gets sourcing actions. Firmware gets integration actions. Electrical gets PCB/power actions. Product managers get schedule/scope decisions. Engineering managers get escalation decisions.
- NEVER give a supply chain action to a mechanical engineer. NEVER give a firmware task to a product manager. Stay strictly in role.`;
}

/**
 * Generate a digest for a single persona
 *
 * @param {Object} persona - from personas.js
 * @param {Object} phase - from phases.js
 * @param {string} messageText - formatted slack messages
 * @param {string} apiKey - Anthropic API key
 * @returns {Object} structured digest JSON
 */
async function generateDigest(persona, phase, messageText, apiKey) {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 700,
    system: buildSystemPrompt(),
    messages: [
      { role: 'user', content: buildUserPrompt(persona, phase, messageText) }
    ]
  });

  const raw = response.content.map(c => c.type === 'text' ? c.text : '').join('');
  const clean = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

/**
 * Generate digests for all personas in parallel
 *
 * @param {string} phaseId - 'design' | 'bringup' | 'manufacturing'
 * @param {string} messageText - formatted slack messages
 * @param {string} apiKey - Anthropic API key
 * @param {string[]} personaIds - which personas to generate for
 * @returns {Object} map of personaId -> digest
 */
async function generateAllDigests(phaseId, messageText, apiKey, personaIds) {
  const { getPersona } = require('../data/personas');
  const phase = getPhase(phaseId);

  const results = await Promise.allSettled(
    personaIds.map(async (id) => {
      const persona = getPersona(id);
      const digest = await generateDigest(persona, phase, messageText, apiKey);
      return { id, digest };
    })
  );

  const digests = {};
  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      digests[result.value.id] = result.value.digest;
    } else {
      console.error('Digest generation failed:', result.reason);
    }
  });

  return digests;
}

/**
 * Analyze a single Slack message — returns summary, priority, suggested response, affected roles
 */
async function analyzeMessage(message, phase, apiKey) {
  const client = new Anthropic({ apiKey });

  const channelName = message.channel?.name || 'general';
  const userName    = message.user?.name || 'Team Member';
  const phaseObj    = getPhase(phase);

  const system = `You are an AI assistant embedded in EverCurrent, a platform for robotics hardware engineering teams.
You deeply understand hardware engineering: mechanical design, supply chain, firmware, and engineering management.
You always return valid JSON with no markdown, no backticks, no preamble.`;

  const user = `PHASE: ${phaseObj.context}

SLACK MESSAGE:
Channel: #${channelName}
From: ${userName}
Message: "${message.text}"

Analyze this message for the team and return ONLY a valid JSON object:
{
  "summary": "1-2 sentence plain-English summary of what this message means for the team",
  "priority": "critical | high | medium | low",
  "priorityReason": "one sentence explaining the priority rating, under 15 words",
  "affectedRoles": ["list of roles from: mechanical, supply-chain, firmware, management, product"],
  "actionNeeded": "specific next action, under 20 words, or null if no action needed",
  "suggestedResponse": "a ready-to-send Slack reply the reader could use, 1-3 sentences, professional tone"
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system,
    messages: [{ role: 'user', content: user }]
  });

  const raw   = response.content.map(c => c.type === 'text' ? c.text : '').join('');
  const clean = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

module.exports = { generateDigest, generateAllDigests, analyzeMessage };
