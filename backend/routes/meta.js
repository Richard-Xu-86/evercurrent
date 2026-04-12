/**
 * routes/meta.js
 *
 * Metadata endpoints — returns persona and phase definitions to the frontend.
 * Keeping these server-side means the frontend is data-driven:
 * adding a new persona or phase only requires a backend change.
 *
 * GET /api/personas  - All persona definitions
 * GET /api/phases    - All phase definitions
 */

const express = require('express');
const router = express.Router();
const { getAllPersonas } = require('../data/personas');
const { getAllPhases } = require('../data/phases');

router.get('/personas', (req, res) => {
  // Strip the verbose role prompt from the API response (internal only)
  const personas = getAllPersonas().map(({ role, ...rest }) => rest);
  res.json({ personas });
});

router.get('/phases', (req, res) => {
  // Strip the verbose context prompt from the API response (internal only)
  const phases = getAllPhases().map(({ context, ...rest }) => rest);
  res.json({ phases });
});

module.exports = router;
