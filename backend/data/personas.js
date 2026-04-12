/**
 * data/personas.js
 *
 * Defines the 6 engineering role personas used to personalize AI digests.
 *
 * Each persona has:
 *  - id:            short key used across the app (matches the role buttons in the UI)
 *  - name:          role title injected into the Claude prompt so it knows who it's writing for
 *  - role:          the core prompt context — tells Claude what this person cares about,
 *                   what to prioritize, and what to ignore. This is what makes each
 *                   digest different even when everyone is reading the same Slack messages.
 *  - sectionLabels: custom labels for the three digest sections shown in the UI card
 *
 * Visual metadata (avatar colors, initials) lives in frontend/js/ui.js → ROLE_INFO.
 * In production, personas would be stored per-user in a database so each person
 * can update their own role context as their responsibilities change.
 */

const personas = {

  me: {
    id: 'me',
    name: 'Mechanical Engineer',
    role: `
      Mechanical Engineer, DRI (directly responsible individual) for arm assembly.
      Cares about: tolerance specs, fabrication sign-offs, bring-up test failures in their subsystem,
      and any design changes that affect physical parts or the assembly schedule.
      Does NOT need supply chain financials or firmware internals unless they directly block mechanical work.
      Wants to know: what needs action today, what might block assembly this week.
    `,
    sectionLabels: {
      blocker:  'Blockers · action required',
      watch:    'Watch items',
      positive: 'On track'
    }
  },

  ee: {
    id: 'ee',
    name: 'Electrical Engineer',
    role: `
      Electrical Engineer responsible for PCB design, power systems, and hardware interfaces.
      Cares about: motor driver specs, encoder signal integrity, power budget margins, PCB revision triggers,
      EMI and thermal issues, and any mechanical or firmware changes that affect board layout or component selection.
      Does NOT need supply chain pricing or org-level decisions unless they require a board respin.
      Wants to know: what hardware issues need an EE fix, what component changes affect the PCB,
      what tests are revealing electrical problems, and what firmware requests require hardware support.
    `,
    sectionLabels: {
      blocker:  'Blockers · action required',
      watch:    'Watch items',
      positive: 'On track'
    }
  },

  fw: {
    id: 'fw',
    name: 'Firmware Engineer',
    role: `
      Firmware Engineer responsible for motor controls and hardware integration.
      Cares about: bring-up test failures, hardware readiness blocking firmware work, torque and encoder issues,
      and any mechanical or supply chain changes that affect firmware interfaces or APIs.
      Does NOT need BOM financials or org decisions unless they directly block firmware development.
      Wants to know: what hardware is blocking firmware, what tests are failing, what needs investigation.
    `,
    sectionLabels: {
      blocker:  'Blockers · action required',
      watch:    'Watch items',
      positive: 'On track'
    }
  },

  sc: {
    id: 'sc',
    name: 'Supply Chain Lead',
    role: `
      Supply Chain Lead and BOM (bill of materials) owner.
      Cares about: part lead times vs freeze deadlines, qualified supplier alternatives, cost impacts,
      and any design changes that alter the BOM or affect procurement timing.
      Does NOT need firmware details or test specifics unless they change part requirements.
      Wants to know: sourcing risks, schedule pressure from procurement, BOM change triggers.
    `,
    sectionLabels: {
      blocker:  'Blockers · action required',
      watch:    'Watch items',
      positive: 'On track'
    }
  },

  pm: {
    id: 'pm',
    name: 'Product Manager',
    role: `
      Product Manager responsible for roadmap, delivery commitments, and customer requirements.
      Cares about: anything that threatens the ship date or customer commitments, feature completeness,
      go/no-go decisions, scope changes, and cross-team blockers that affect the delivery timeline.
      Does NOT want raw technical details — only what it means for schedule, customer impact, or product scope.
      Wants to know: is the team on track to ship, what decisions need PM input, what customer-facing
      features are at risk, and what trade-offs need to be made between scope, schedule, and quality.
    `,
    sectionLabels: {
      blocker:  'Decisions needed',
      watch:    'Delivery risks',
      positive: 'On track'
    }
  },

  em: {
    id: 'em',
    name: 'Engineering Manager',
    role: `
      Engineering Manager overseeing the Atlas Robot v2 program.
      Cares about: decisions only they can make, cross-team blockers, schedule risk, team velocity,
      and anything that could affect the project timeline or budget.
      Does NOT want raw technical details — only executive summaries, risk flags, decisions pending their input.
      Wants to know: what's blocked, who's blocked, what needs their call, how the team is tracking overall.
    `,
    sectionLabels: {
      blocker:  'Decisions pending you',
      watch:    'Team health',
      positive: 'Velocity signal'
    }
  }

};

/**
 * Get a single persona by id.
 * Called by digestService.js every time a digest or analysis is generated.
 * Throws if the id doesn't match any known persona.
 */
function getPersona(id) {
  if (!personas[id]) throw new Error(`Unknown persona: "${id}". Valid ids: ${Object.keys(personas).join(', ')}`);
  return personas[id];
}

/**
 * Get all personas as an array.
 * Used by the GET /api/personas metadata endpoint.
 */
function getAllPersonas() {
  return Object.values(personas);
}

module.exports = { getPersona, getAllPersonas };
