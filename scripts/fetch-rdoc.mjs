#!/usr/bin/env node
// Fetches all 58 current NIMH RDoC construct pages and writes public/rdoc-matrix.json.
// Run: node scripts/fetch-rdoc.mjs

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(__dirname, "..", "public", "rdoc-matrix.json");
const BASE = "https://www.nimh.nih.gov/research/research-funded-by-nimh/rdoc/constructs/";

// Full hierarchy — 58 entries across 6 domains.
// parent: true means this construct has subconstructs and typically has no own units.
const HIERARCHY = [
  // Negative Valence Systems
  { slug: "acute-threat-fear",        domain: "Negative Valence Systems", construct: 'Acute Threat ("Fear")' },
  { slug: "potential-threat-anxiety", domain: "Negative Valence Systems", construct: 'Potential Threat ("Anxiety")' },
  { slug: "sustained-threat",         domain: "Negative Valence Systems", construct: "Sustained Threat" },
  { slug: "loss",                     domain: "Negative Valence Systems", construct: "Loss" },
  { slug: "frustrative-nonreward",    domain: "Negative Valence Systems", construct: "Frustrative Nonreward" },

  // Positive Valence Systems
  { slug: "reward-responsiveness",               domain: "Positive Valence Systems", construct: "Reward Responsiveness", parent: true },
  { slug: "reward-anticipation",                 domain: "Positive Valence Systems", construct: "Reward Responsiveness", subconstruct: "Reward Anticipation" },
  { slug: "initial-response-to-reward",          domain: "Positive Valence Systems", construct: "Reward Responsiveness", subconstruct: "Initial Response to Reward" },
  { slug: "reward-satiation",                    domain: "Positive Valence Systems", construct: "Reward Responsiveness", subconstruct: "Reward Satiation" },
  { slug: "reward-learning",                     domain: "Positive Valence Systems", construct: "Reward Learning", parent: true },
  { slug: "probabilistic-and-reinforcement-learning", domain: "Positive Valence Systems", construct: "Reward Learning", subconstruct: "Probabilistic and Reinforcement Learning" },
  { slug: "reward-prediction-error",             domain: "Positive Valence Systems", construct: "Reward Learning", subconstruct: "Reward Prediction Error" },
  { slug: "habit-pvs",                           domain: "Positive Valence Systems", construct: "Reward Learning", subconstruct: "Habit" },
  { slug: "reward-valuation",                    domain: "Positive Valence Systems", construct: "Reward Valuation", parent: true },
  { slug: "reward-probability",                  domain: "Positive Valence Systems", construct: "Reward Valuation", subconstruct: "Reward (Probability)" },
  { slug: "delay",                               domain: "Positive Valence Systems", construct: "Reward Valuation", subconstruct: "Delay" },
  { slug: "effort",                              domain: "Positive Valence Systems", construct: "Reward Valuation", subconstruct: "Effort" },

  // Cognitive Systems
  { slug: "attention",                domain: "Cognitive Systems", construct: "Attention" },
  { slug: "perception",               domain: "Cognitive Systems", construct: "Perception", parent: true },
  { slug: "visual-perception",        domain: "Cognitive Systems", construct: "Perception", subconstruct: "Visual Perception" },
  { slug: "auditory-perception",      domain: "Cognitive Systems", construct: "Perception", subconstruct: "Auditory Perception" },
  { slug: "olfactory-somatosensory-multimodal-perception", domain: "Cognitive Systems", construct: "Perception", subconstruct: "Olfactory/Somatosensory/Multimodal Perception" },
  { slug: "declarative-memory",       domain: "Cognitive Systems", construct: "Declarative Memory" },
  { slug: "language-behavior",        domain: "Cognitive Systems", construct: "Language" },
  { slug: "cognitive-control",        domain: "Cognitive Systems", construct: "Cognitive Control", parent: true },
  { slug: "goal-selection-updating-representation-and-maintenance", domain: "Cognitive Systems", construct: "Cognitive Control", subconstruct: "Goal Selection, Updating, Representation, and Maintenance" },
  { slug: "suppression",              domain: "Cognitive Systems", construct: "Cognitive Control", subconstruct: "Response Selection/Inhibition/Suppression" },
  { slug: "performance-monitoring",   domain: "Cognitive Systems", construct: "Cognitive Control", subconstruct: "Performance Monitoring" },
  { slug: "working-memory",           domain: "Cognitive Systems", construct: "Working Memory", parent: true },
  { slug: "active-maintenance",       domain: "Cognitive Systems", construct: "Working Memory", subconstruct: "Active Maintenance" },
  { slug: "flexible-updating",        domain: "Cognitive Systems", construct: "Working Memory", subconstruct: "Flexible Updating" },
  { slug: "limited-capacity",         domain: "Cognitive Systems", construct: "Working Memory", subconstruct: "Limited Capacity" },
  { slug: "interference-control",     domain: "Cognitive Systems", construct: "Working Memory", subconstruct: "Interference Control" },

  // Social Processes
  { slug: "affiliation-and-attachment",          domain: "Social Processes", construct: "Affiliation and Attachment" },
  { slug: "social-communication",                domain: "Social Processes", construct: "Social Communication", parent: true },
  { slug: "reception-of-facial-communication",   domain: "Social Processes", construct: "Social Communication", subconstruct: "Reception of Facial Communication" },
  { slug: "production-of-facial-communication",  domain: "Social Processes", construct: "Social Communication", subconstruct: "Production of Facial Communication" },
  { slug: "reception-of-non-facial-communication",  domain: "Social Processes", construct: "Social Communication", subconstruct: "Reception of Non-Facial Communication" },
  { slug: "production-of-non-facial-communication", domain: "Social Processes", construct: "Social Communication", subconstruct: "Production of Non-Facial Communication" },
  { slug: "perception-and-understanding-of-self",   domain: "Social Processes", construct: "Perception and Understanding of Self", parent: true },
  { slug: "agency",                              domain: "Social Processes", construct: "Perception and Understanding of Self", subconstruct: "Agency" },
  { slug: "self-knowledge",                      domain: "Social Processes", construct: "Perception and Understanding of Self", subconstruct: "Self-Knowledge" },
  { slug: "perception-and-understanding-of-others", domain: "Social Processes", construct: "Perception and Understanding of Others", parent: true },
  { slug: "animacy-perception",                  domain: "Social Processes", construct: "Perception and Understanding of Others", subconstruct: "Animacy Perception" },
  { slug: "action-perception",                   domain: "Social Processes", construct: "Perception and Understanding of Others", subconstruct: "Action Perception" },
  { slug: "understanding-mental-states",         domain: "Social Processes", construct: "Perception and Understanding of Others", subconstruct: "Understanding Mental States" },

  // Arousal and Regulatory Systems
  { slug: "arousal",           domain: "Arousal and Regulatory Systems", construct: "Arousal" },
  { slug: "circadian-rhythms", domain: "Arousal and Regulatory Systems", construct: "Circadian Rhythms" },
  { slug: "sleep-wakefulness", domain: "Arousal and Regulatory Systems", construct: "Sleep-Wakefulness" },

  // Sensorimotor Systems
  { slug: "motor-actions",               domain: "Sensorimotor Systems", construct: "Motor Actions", parent: true },
  { slug: "action-planning-and-selection", domain: "Sensorimotor Systems", construct: "Motor Actions", subconstruct: "Action Planning and Selection" },
  { slug: "sensorimotor-dynamics",       domain: "Sensorimotor Systems", construct: "Motor Actions", subconstruct: "Sensorimotor Dynamics" },
  { slug: "initiation",                  domain: "Sensorimotor Systems", construct: "Motor Actions", subconstruct: "Initiation" },
  { slug: "execution",                   domain: "Sensorimotor Systems", construct: "Motor Actions", subconstruct: "Execution" },
  { slug: "inhibition-and-termination",  domain: "Sensorimotor Systems", construct: "Motor Actions", subconstruct: "Inhibition and Termination" },
  { slug: "agency-and-ownership",        domain: "Sensorimotor Systems", construct: "Agency and Ownership" },
  { slug: "habit-sensorimotor",          domain: "Sensorimotor Systems", construct: "Habit (Sensorimotor)" },
  { slug: "innate-motor-patterns",       domain: "Sensorimotor Systems", construct: "Innate Motor Patterns" },
];

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseUnits(html) {
  const units = [];
  const unitBlockRe =
    /<h[23][^>]*rdoc-unit__heading--unit-name[^>]*>([\s\S]*?)<\/h[23]>([\s\S]*?)(?=<h[23][^>]*rdoc-unit__heading|$)/gi;
  let um;
  while ((um = unitBlockRe.exec(html)) !== null) {
    const unitName = stripTags(um[1]).trim();
    if (!unitName) continue;
    const body = um[2];
    const elements = [];
    const elRe = /<span[^>]*rdoc-unit__el[^>]*>([\s\S]*?)<\/span>/gi;
    let em;
    while ((em = elRe.exec(body)) !== null) {
      const el = stripTags(em[1]).trim();
      if (el) elements.push(el);
    }
    units.push({ name: unitName, elements });
  }
  return units;
}

async function fetchPage(slug) {
  const url = BASE + slug;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; RdocBot/2.0)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const constructs = [];
  const total = HIERARCHY.length;

  for (let i = 0; i < total; i++) {
    const entry = HIERARCHY[i];
    const { slug, domain, construct, subconstruct, parent } = entry;
    const label = subconstruct ?? construct;
    process.stdout.write(`[${i + 1}/${total}] ${slug} ... `);

    let units = [];
    try {
      const html = await fetchPage(slug);
      units = parseUnits(html);
      console.log(`${units.length} units`);
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
    }

    const idParts = [domain, construct];
    if (subconstruct) idParts.push(subconstruct);
    const id = slugify(idParts.join("-"));

    const entry_out = { id, domain, construct };
    if (subconstruct) entry_out.subconstruct = subconstruct;
    entry_out.units = units;

    constructs.push(entry_out);

    if (i < total - 1) await sleep(400);
  }

  const matrix = { fetchedAt: new Date().toISOString(), constructs };
  fs.writeFileSync(OUTPUT, JSON.stringify(matrix, null, 2), "utf-8");

  console.log(`\nWrote ${constructs.length} constructs to ${OUTPUT}`);
  const withUnits = constructs.filter((c) => c.units.length > 0).length;
  console.log(`${withUnits} constructs have units, ${constructs.length - withUnits} are parent/sparse entries.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
