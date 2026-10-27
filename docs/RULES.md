# Rules implemented by the engine

These rules are implemented once in `game-engine/src/engine.ts` (server, authoritative for online play)
and mirrored in `mobile/lib/engine/engine.dart` (offline play). The shared test vectors in
`shared/fixtures/engine-vectors.json` (copied to `mobile/test/fixtures/`) prove both produce identical
results step by step.

## Tiles and players
- Standard double-six set: 28 unique tiles, values 0–6. A tile's identity is `low-high` (e.g. `3-5`),
  independent of how it is oriented on the board.
- 2, 3 or 4 players. Everybody plays for themselves — no teams.

## Dealing
- 2 players: 7 tiles each. 3 or 4 players: 5 tiles each. The rest forms the stock.
- Fisher–Yates shuffle. Online matches use a cryptographic random source; offline/test games use the
  deterministic `mulberry32` generator.

## Who starts
- **Round 1:** the player holding the highest double (6-6, then 5-5 … 0-0) starts and **must open with it**.
  If nobody holds a double, the holder of the heaviest tile (highest pip total, then highest single
  value) starts and must open with that tile. This is identical online and offline.
- **Later rounds:** the winner of the previous round starts and may open with any tile.

## Playing
- A tile may be played on the left or right open end if one of its values matches that end.
  A tile matching both ends may go on either side. Doubles are placed across the line and expose the
  same value.
- On an empty board the opening tile is placed as-is (canonical `left` end).

## Drawing and passing
- A player may **draw only when they have no playable tile** and the stock is not empty.
  Drawing is rejected when a legal move exists (`MOVE_AVAILABLE`) or the stock is empty (`STOCK_EMPTY`).
- After drawing, the turn stays with the same player: they keep drawing until a tile fits.
  A playable drawn tile is therefore the player's only legal option and must be played.
- A player may **pass only when they have no playable tile and the stock is empty**. Passing with
  tiles left in the stock is rejected (`MUST_DRAW`).
- Draws and passes publicly reveal that the player lacks the open-end values (used by the bots).

## End of a round
- **Domino:** a player who plays their last tile wins the round.
- **Blocked:** when every player passes consecutively (stock empty, no legal move for anyone), the
  player with the lowest pip total wins; ties go to fewer tiles, then the lowest seat number.

## Scoring and match end
- The round winner scores the sum of all pips left in every opponent's hand (in both cases above).
- Scores accumulate across rounds. Target score is chosen before the match: 50, 100, 150 or 200.
- When the round winner reaches or exceeds the target, the match ends and that player wins.
  Only the round winner scores, so two players can never cross the target together.

## Integrity
After every action the engine verifies: 28 unique tiles across hands + board + stock, a connected
chain on the board, valid orientations, the active seat and pass counter in range, non-negative scores,
and that finished rounds/matches accept no further moves. Actions are applied to a copy; a rejected
action never changes the state. Every accepted action increments `version`, which the server uses to
reject stale or duplicated client actions.
