/**
 * data/slackMessages.js
 *
 * In-memory message store for the Slack feed.
 *
 * Messages are populated at startup via real Slack ingestion (services/slackIngestion.js)
 * and can be added manually through the UI or via the POST /api/messages endpoint.
 *
 * Each message mirrors the shape of a Slack API payload so the digest service
 * doesn't care whether a message came from real Slack or was typed in manually.
 *
 * In production this would be replaced by a proper database (PostgreSQL / MongoDB)
 * so messages persist across server restarts and can be queried efficiently.
 */

// No hardcoded seed data — messages come from real Slack ingestion on startup
const seedMessages = [];

// Runtime message store — lives in memory for the duration of the server session
let messages = [...seedMessages];

/**
 * Get all messages, optionally filtered by channel
 */
function getMessages(channelFilter = null) {
  if (channelFilter) {
    return messages.filter(m => m.channel.name === channelFilter);
  }
  return messages;
}

/**
 * Add a new message to the store.
 * Called when a user types a message in the UI or a preset is injected.
 * Assigns a unique id and timestamp automatically.
 */
function addMessage(msg) {
  const newMsg = {
    id: 'msg_' + Date.now(),
    ts: (Date.now() / 1000).toFixed(6),
    user: msg.user,
    channel: msg.channel,
    text: msg.text,
    reactions: [],
    thread_replies: 0
  };
  messages.push(newMsg);
  return newMsg;
}

/**
 * Wipe all messages and reset to the empty seed state.
 * Useful for demos or clearing test data between runs.
 */
function resetMessages() {
  messages = [...seedMessages];
}

/**
 * Format messages into a plain text summary for the AI prompt
 */
function formatForPrompt() {
  return messages.map(m =>
    `[${m.channel.name}] ${m.user.name}: ${m.text}`
  ).join('\n');
}

module.exports = { getMessages, addMessage, resetMessages, formatForPrompt };
