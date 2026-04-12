require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const digestRoutes  = require('./routes/digest');
const messageRoutes = require('./routes/messages');
const metaRoutes    = require('./routes/meta');
const slackRoutes   = require('./routes/slack');

const app  = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// API routes
app.use('/api/digest',   digestRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/slack',    slackRoutes);
app.use('/api',          metaRoutes);

// Serve frontend
app.use(express.static(path.join(__dirname, '../frontend')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

app.listen(PORT, async () => {
  const slackToken = process.env.SLACK_BOT_TOKEN;
  const hasSlack   = slackToken && slackToken !== 'xoxb-your-token-here';

  console.log(`\n  EverCurrent Daily Digest`);
  console.log(`  ─────────────────────────`);
  console.log(`  Running at   http://localhost:${PORT}`);
  console.log(`  Anthropic:   ${process.env.ANTHROPIC_API_KEY ? '✓ loaded from .env' : '✗ not set — enter in UI or .env'}`);
  console.log(`  Slack:       ${hasSlack ? '✓ token found — auto-ingesting...' : '✗ not set — using simulated messages'}`);
  console.log(`  Press Ctrl+C to stop\n`);

  // Auto-ingest from Slack on startup if token is configured
  if (hasSlack) {
    try {
      const { ingestSlackMessages } = require('./services/slackIngestion');
      const summary = await ingestSlackMessages(slackToken);
      console.log(`  ✓ Slack ingestion complete: ${summary.messageCount} messages from ${summary.channelsFetched} channels\n`);
    } catch (err) {
      console.warn(`  ✗ Slack ingestion failed: ${err.message}`);
      console.warn(`  → Falling back to simulated messages\n`);
    }
  }
});

module.exports = app;
