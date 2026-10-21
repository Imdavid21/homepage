// Everything tunable lives here. Recalibrate after the first live runs.
export const CONFIG = {
  // Claim window: 22 Oct 2026 12:00 IST to 24 Oct 2026 12:00 IST
  opensAt: Date.parse("2026-10-22T12:00:00+05:30"),
  closesAt: Date.parse("2026-10-24T12:00:00+05:30"),
  eligibleAt: 90,      // score needed to be eligible
  // While true every name that resolves is eligible. The score is still computed and shown.
  // Set EVERYONE_ELIGIBLE=0 in Vercel to switch the 90 gate back on.
  everyone: process.env.EVERYONE_ELIGIBLE !== "0",
  cards: 25,           // eligible entries are ranked, top N get a card
  hlGenesis: Date.parse("2024-11-29T00:00:00Z"),
  // Saturation points: score for a component maxes out here. This is an OG score, not a profit score.
  tenureMonths: 24,
  hypeCap: 100,
  volumeUsd: 5_000_000,
  hipMarkets: 10,
  trades: 1000,
  weights: { tenure: 35, hype: 20, volume: 20, hip: 10, trades: 15 },
  // Block explorers shown next to a result so anyone can verify the wallet behind a name.
  // {a} is the wallet address, {n} the name. Edit freely.
  explorers: [
    { label: "Hyperliquid explorer", url: "https://app.hyperliquid.xyz/explorer/address/{a}" },
    { label: "Etherscan", url: "https://etherscan.io/address/{a}" },
    { label: "ENS app", url: "https://app.ens.domains/{n}", only: "eth" },
  ],
};
