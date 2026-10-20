import { fetchRaw } from "../lib/hl.js";
import { computeScore } from "../lib/score.js";
const a = process.argv[2]; if (!a) { console.log("usage: npm run smoke -- 0xADDRESS"); process.exit(1); }
const raw = await fetchRaw(a); console.log(raw); console.log(computeScore(raw));
