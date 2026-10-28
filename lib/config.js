// Everything tunable lives here. Recalibrate after the first live runs.
export const CONFIG = {
  // Claim window: 28 Oct 8:00 PM to 29 Oct 8:00 PM 2026, IST
  opensAt: Date.parse("2026-10-28T20:00:00+05:30"),
  closesAt: Date.parse("2026-10-29T20:00:00+05:30"),
  eligibleAt: 90,      // score needed to claim
  // The score gates claiming. Set EVERYONE_ELIGIBLE=1 in Vercel to let every name that resolves claim (testing only).
  everyone: process.env.EVERYONE_ELIGIBLE === "1",
  cards: 25,           // eligible entries are ranked, top N get a card
  hlGenesis: Date.parse("2024-11-29T00:00:00Z"),
  // Saturation points: score for a component maxes out here. This is an OG score, not a profit score.
  tenureMonths: 24,
  hypeCap: 100,
  volumeUsd: 5_000_000,
  hipMarkets: 10,
  trades: 1000,
  nameMonths: 12, // months of name age for full points, the same for .eth and .hl
  weights: { tenure: 25, hype: 20, volume: 20, hip: 10, trades: 15, name: 10 },
  // The Ethereum track. A wallet is scored on Hyperliquid and on Ethereum, and the higher of the two counts.
  // Easier to reach than the Hyperliquid track: a year-old wallet with 100 transactions and a quarter of an ETH is a full score.
  eth: { weights: { age: 30, txs: 30, bal: 20, name: 20 }, ageMonths: 12, txs: 100, balEth: 0.25 },
  // Block explorers shown next to a result so anyone can verify the wallet behind a name.
  // {a} is the wallet address, {n} the name. Edit freely.
  explorers: [
    { label: "Hyperliquid explorer", url: "https://app.hyperliquid.xyz/explorer/address/{a}" },
    { label: "Etherscan", url: "https://etherscan.io/address/{a}" },
    { label: "ENS app", url: "https://app.ens.domains/{n}", only: "eth" },
  ],
};
