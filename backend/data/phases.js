/**
 * data/phases.js
 *
 * Defines the hardware project phases and their AI context.
 * The phase context is injected into every digest prompt — this is the
 * core mechanism for temporal adaptation. As a project progresses,
 * the same Slack messages get reprioritized based on what matters now.
 *
 * In a real product, the active phase would be stored per-project
 * and could be updated by the PM or EM as milestones are hit.
 */

const phases = {
  design: {
    id: 'design',
    label: 'Design',
    badge: 'design',
    weekLabel: 'Week 1',
    context: `
      DESIGN PHASE:
      The team is focused on requirements clarity, open design questions, CAD reviews,
      tolerance specs, and avoiding scope drift. Manufacturing and bring-up concerns are
      future-looking. Highlight open decisions, unresolved requirements, review deadlines,
      and risks of requirements freeze. Supply chain should be planning, not executing.
      Test failures don't exist yet — flag simulation or analysis concerns instead.
    `
  },
  bringup: {
    id: 'bringup',
    label: 'Bring-up',
    badge: 'bring-up',
    weekLabel: 'Week 3 of 6',
    context: `
      BRING-UP PHASE (week 3 of 6):
      The team is running hardware integration tests, resolving firmware/mechanical conflicts,
      and racing against BOM freeze. Test failures, cross-team blockers, and supply chain timing
      are critical. Velocity against the bring-up schedule matters — flag anything that could
      extend the bring-up timeline. Design changes at this stage are high-risk and need escalation.
    `
  },
  manufacturing: {
    id: 'manufacturing',
    label: 'Manufacturing',
    badge: 'mfg',
    weekLabel: 'Week 1',
    context: `
      MANUFACTURING PHASE:
      The team is focused on yield, quality control, BOM accuracy, production readiness,
      and cost targets. Design changes are extremely disruptive and require immediate escalation.
      Any rework risk, late-stage spec changes, or supplier issues must be surfaced as top priority.
      Engineering capacity should be focused on production support, not new development.
    `
  }
};

function getPhase(id) {
  if (!phases[id]) throw new Error(`Unknown phase: ${id}`);
  return phases[id];
}

function getAllPhases() {
  return Object.values(phases);
}

module.exports = { getPhase, getAllPhases };
