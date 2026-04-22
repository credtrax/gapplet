-- Remove the ≤ 5.0 upper bound on games.chain_peak.
--
-- The original schema capped chain_peak at 5.0 because the game's chain
-- multiplier itself was capped there. Post-2026-04-22, interior-split
-- "star moves" double the chain multiplier with no ceiling, so committed
-- games can peak arbitrarily high (×8, ×16, ×32…). Drop the upper bound
-- while keeping the lower bound (chain_peak >= 1.0) for sanity.

ALTER TABLE public.games DROP CONSTRAINT games_chain_peak_check;
ALTER TABLE public.games
  ADD CONSTRAINT games_chain_peak_check CHECK (chain_peak >= 1.0);
