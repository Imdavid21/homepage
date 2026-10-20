// Everything tunable lives here. Recalibrate after the first live runs.
export const CONFIG = {
  // Claim window: 22 Oct 2026 12:00 IST to 24 Oct 2026 12:00 IST
  opensAt: Date.parse("2026-10-22T12:00:00+05:30"),
  closesAt: Date.parse("2026-10-24T12:00:00+05:30"),
  eligibleAt: 90,      // score needed to be eligible
  cards: 25,           // eligible entries are ranked, top N get a card
  hlGenesis: Date.parse("2024-11-29T00:00:00Z"),
  // Saturation points: score for a component maxes out here.
  tenureMonths: 18,
  stakedHype: 1000,
  volumeUsd: 5_000_000,
  activeDays14: 7,
  referrals: 25,
  weights: { tenure: 20, staking: 20, volume: 15, activity: 15, breadth: 20, contribution: 10 },
  // Block explorers shown next to a result so anyone can verify the wallet behind a name.
  // {a} is the wallet address, {n} the name. Edit freely.
  explorers: [
    { label: "Hypurrscan", url: "https://hypurrscan.io/address/{a}" },
    { label: "HyperEVMScan", url: "https://hyperevmscan.io/address/{a}" },
    { label: "Etherscan", url: "https://etherscan.io/address/{a}" },
    { label: "ENS app", url: "https://app.ens.domains/{n}", only: "eth" },
  ],
};
