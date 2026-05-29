#!/usr/bin/env node
import 'dotenv/config';
import { runDTVisionTask } from './agent.js';
import { copyFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const APP_URL = 'https://qof78400.apps.dynatrace.com';
const APP_PATH = '/ui/apps/my.smartscape.topology.builder';
const DEST_DIR = resolve('../smartscape-topology-builder/docs/screenshots');

const SHOTS = [
  {
    name: 'topology-builder',
    tab: 'Topology Builder',
    goal: 'The page has loaded. I need a screenshot of the "Topology Builder" tab — the main canvas editor showing the entity browser sidebar on the left (with entity type chips and list) and the SVG canvas on the right. If the Topology Builder tab is not already selected, click it. Wait for the page to settle, then report done.',
  },
  {
    name: 'relationships',
    tab: 'Relationships',
    goal: 'Click the "Relationships" navigation tab at the top of the page, wait for the relationships list to load, then report done.',
  },
  {
    name: 'created-rules',
    tab: 'Created Rules',
    goal: 'Click the "Created Rules" navigation tab at the top of the page, wait for the settings/metrics audit view to load, then report done.',
  },
  {
    name: 'audit-trail',
    tab: 'Audit Trail',
    goal: 'Click the "Audit Trail" navigation tab at the top of the page, wait for the execution history log to load, then report done.',
  },
];

const sharedConfig = {
  tenantURL: APP_URL,
  startPath: APP_PATH,
  credentials: {
    username: process.env.DT_USERNAME,
    password: process.env.DT_PASSWORD,
  },
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  headless: process.env.DT_HEADLESS !== 'false',
  maxSteps: 8,
  screenshotFormat: 'png',
  artifactsDir: './artifacts',
};

mkdirSync(DEST_DIR, { recursive: true });

for (const shot of SHOTS) {
  console.log(`\n=== Capturing: ${shot.name} ===`);
  try {
    const result = await runDTVisionTask({ ...sharedConfig, goal: shot.goal });
    // The final screenshot is the last artifact
    const shots = result.screenshots ?? [];
    if (shots.length > 0) {
      const src = shots[shots.length - 1].path;
      const dest = resolve(DEST_DIR, `${shot.name}.png`);
      copyFileSync(src, dest);
      console.log(`  ✓ Saved: ${dest}`);
    } else {
      console.warn(`  ⚠ No artifact path returned for ${shot.name}`);
    }
  } catch (err) {
    console.error(`  ✗ Failed ${shot.name}:`, err.message);
  }
}

console.log('\n=== All screenshots complete ===');
