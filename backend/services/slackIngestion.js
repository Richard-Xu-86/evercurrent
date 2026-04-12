/**
 * services/slackIngestion.js
 *
 * Fetches real messages from Slack using the Web API.
 * Replaces the seed data in slackMessages.js with live channel history.
 *
 * Required bot token scopes:
 *   channels:history, read messages from public channels
 *   channels:read, list public channels
 *   groups:history, read messages from private channels (if needed in later phases)
 *   users:read, resolve user IDs to real names
 *
 *
 */

const { WebClient } = require('@slack/web-api');
const { addMessage, resetMessages } = require('../data/slackMessages');

/**
 * Map Slack role keywords to internal role names
 * Used to assign avatar colors in the UI
 */
function inferRole(channelName = '', text = '') {
  const combined = (channelName + ' ' + text).toLowerCase();
  if (combined.includes('supply') || combined.includes('bom') || combined.includes('procurement')) return 'supply-chain';
  if (combined.includes('mechanical') || combined.includes('mech') || combined.includes('cad')) return 'mechanical';
  if (combined.includes('firmware') || combined.includes('fw') || combined.includes('software')) return 'firmware';
  if (combined.includes('electrical') || combined.includes('ee') || combined.includes('pcb')) return 'electrical';
  return 'general';
}

/**
 * Build initials from a display name
 */
function getInitials(name = '') {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '??';
}

/**
 * Fetch messages from a single channel
 */
async function fetchChannel(client, channelId, channelName, userCache, lookbackHours) {
  const oldest = (Date.now() / 1000 - lookbackHours * 3600).toString();

  const result = await client.conversations.history({
    channel: channelId,
    oldest,
    limit: 100
  });

  const messages = [];

  for (const msg of result.messages || []) {
    // Skip bot messages, join/leave events, and empty messages
    if (msg.subtype || !msg.text || msg.bot_id) continue;

    // Resolve user info (cached to avoid repeated API calls)
    let userName = 'Team Member';
    let userRole = inferRole(channelName, msg.text);

    if (msg.user) {
      if (!userCache[msg.user]) {
        try {
          const info = await client.users.info({ user: msg.user });
          userCache[msg.user] = {
            name: info.user.real_name || info.user.name || 'Team Member',
            role: userRole
          };
        } catch {
          userCache[msg.user] = { name: 'Team Member', role: 'general' };
        }
      }
      userName = userCache[msg.user].name;
      userRole = userCache[msg.user].role || userRole;
    }

    messages.push({
      ts: msg.ts,
      user: {
        id: msg.user || 'unknown',
        name: userName,
        initials: getInitials(userName),
        role: userRole
      },
      channel: {
        id: channelId,
        name: channelName
      },
      text: msg.text,
      reactions: (msg.reactions || []).map(r => ({ emoji: r.name, count: r.count })),
      thread_replies: msg.reply_count || 0
    });
  }

  return messages;
}

/**
 * Main ingestion function — fetches messages from all configured channels
 *
 * @param {string} botToken - Slack bot OAuth token (xoxb-...)
 * @returns {Object} summary of what was ingested
 */
async function ingestSlackMessages(botToken) {
  if (!botToken) throw new Error('SLACK_BOT_TOKEN is not set');

  const client = new WebClient(botToken);
  const lookbackHours = parseInt(process.env.SLACK_LOOKBACK_HOURS || '24', 10);
  const configuredChannels = (process.env.SLACK_CHANNELS || '').split(',').map(c => c.trim()).filter(Boolean);

  // Discover channels
  let channelsToFetch = [];

  if (configuredChannels.length > 0) {
    // Resolve configured channel names to IDs
    const { channels } = await client.conversations.list({ limit: 200, types: 'public_channel,private_channel' });
    channelsToFetch = channels
      .filter(c => configuredChannels.includes(c.name))
      .map(c => ({ id: c.id, name: c.name }));

    const missing = configuredChannels.filter(name => !channelsToFetch.find(c => c.name === name));
    if (missing.length) {
      console.warn(`[slack] Channels not found or bot not invited: ${missing.join(', ')}`);
      console.warn(`[slack] Run /invite @YourApp in each channel in Slack`);
    }
  } else {
    // Auto-discover all channels the bot has joined
    const { channels } = await client.conversations.list({ limit: 200, types: 'public_channel' });
    channelsToFetch = channels
      .filter(c => c.is_member)
      .map(c => ({ id: c.id, name: c.name }));
  }

  if (channelsToFetch.length === 0) {
    throw new Error('No channels found. Make sure the bot is invited to at least one channel.');
  }

  console.log(`[slack] Fetching ${lookbackHours}h of messages from: ${channelsToFetch.map(c => '#' + c.name).join(', ')}`);

  // Fetch messages from all channels in parallel
  const userCache = {};
  const results = await Promise.allSettled(
    channelsToFetch.map(ch => fetchChannel(client, ch.id, ch.name, userCache, lookbackHours))
  );

  // Collect all messages and sort by timestamp
  const allMessages = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      allMessages.push(...result.value);
    } else {
      console.warn(`[slack] Failed to fetch #${channelsToFetch[i].name}:`, result.reason?.message);
    }
  });

  allMessages.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));

  // Replace mock store with real messages
  resetMessages();
  allMessages.forEach(msg => addMessage(msg));

  const summary = {
    channelsFetched: channelsToFetch.length,
    messageCount: allMessages.length,
    lookbackHours,
    channels: channelsToFetch.map(c => c.name)
  };

  console.log(`[slack] Ingested ${allMessages.length} messages from ${channelsToFetch.length} channels`);
  return summary;
}

module.exports = { ingestSlackMessages };
