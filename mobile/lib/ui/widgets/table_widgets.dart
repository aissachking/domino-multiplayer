import 'package:flutter/material.dart';

import '../../engine/models.dart';
import '../../l10n/app_localizations.dart';
import '../../state/table_session.dart';
import '../theme.dart';
import 'domino_tile.dart';

/// Localized display name for a seat.
String seatName(SeatInfo seat, List<SeatInfo> seats, S l) {
  if (seat.isMe) return l.t('you');
  if (seat.isBot) {
    final bots = seats.where((s) => s.isBot).toList();
    return '${l.t('bot')} ${bots.indexWhere((b) => b.id == seat.id) + 1}';
  }
  return seat.name.isEmpty ? '?' : seat.name;
}

String nameForId(String? id, List<SeatInfo> seats, S l) {
  final seat = seats.where((s) => s.id == id).firstOrNull;
  return seat == null ? '?' : seatName(seat, seats, l);
}

/// Numbers inside RTL text: isolate them so "45 / 100" never flips.
Widget ltrText(String text, {TextStyle? style}) =>
    Directionality(textDirection: TextDirection.ltr, child: Text(text, style: style));

class SeatChip extends StatelessWidget {
  const SeatChip({super.key, required this.seat, required this.seats, required this.active, required this.target});

  final SeatInfo seat;
  final List<SeatInfo> seats;
  final bool active;
  final int target;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final name = seatName(seat, seats, l);
    final offline = !seat.connected || seat.autopilot;
    return Semantics(
      label: '$name, ${l.t('tilesN', {'n': seat.tileCount})}, ${seat.score}',
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 250),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: active ? kAccent : Colors.white.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: active ? Colors.white : Colors.white24, width: active ? 2 : 1),
        ),
        child: FittedBox(
          fit: BoxFit.scaleDown,
          child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              seat.isBot ? Icons.smart_toy_rounded : (offline ? Icons.wifi_off_rounded : Icons.person_rounded),
              size: 20,
              color: active ? const Color(0xFF3A2600) : Colors.white,
            ),
            const SizedBox(width: 6),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 110),
                  child: Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 14,
                      color: active ? const Color(0xFF3A2600) : Colors.white,
                    ),
                  ),
                ),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const DominoTile.back(length: 14),
                    const SizedBox(width: 3),
                    ltrText('×${seat.tileCount}',
                        style: TextStyle(fontSize: 12, color: active ? const Color(0xFF3A2600) : Colors.white70)),
                    const SizedBox(width: 8),
                    ltrText('${seat.score}/$target',
                        style: TextStyle(
                            fontSize: 12, fontWeight: FontWeight.w700, color: active ? const Color(0xFF3A2600) : Colors.white)),
                  ],
                ),
                if (seat.autopilot)
                  Text(l.t('autopilot'), style: TextStyle(fontSize: 10, color: active ? Colors.black54 : Colors.white60)),
              ],
            ),
          ],
          ),
        ),
      ),
    );
  }
}

class ConnectionBanner extends StatelessWidget {
  const ConnectionBanner({super.key, required this.status, this.onRetry});
  final ConnectionStatus status;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    if (status == ConnectionStatus.connected) return const SizedBox.shrink();
    final offline = status == ConnectionStatus.offline;
    return Material(
      color: offline ? Colors.red.shade700 : Colors.orange.shade800,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          child: Row(
            children: [
              if (!offline)
                const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              else
                const Icon(Icons.cloud_off_rounded, color: Colors.white, size: 18),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  l.t('conn_${status.name}'),
                  key: const ValueKey('connection-banner'),
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
                ),
              ),
              if (offline && onRetry != null)
                TextButton(onPressed: onRetry, child: Text(l.t('retry'), style: const TextStyle(color: Colors.white))),
            ],
          ),
        ),
      ),
    );
  }
}

/// Round / match summary shown over the board.
class RoundResultPanel extends StatelessWidget {
  const RoundResultPanel({
    super.key,
    required this.snapshot,
    required this.onNextRound,
    required this.onPlayAgain,
    required this.onMenu,
    required this.autoNext,
  });

  final TableSnapshot snapshot;
  final VoidCallback onNextRound;
  final VoidCallback? onPlayAgain;
  final VoidCallback onMenu;
  final bool autoNext;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final result = snapshot.lastRound;
    final seats = snapshot.seats;
    final matchOver = snapshot.phase == Phase.matchOver;
    final scheme = Theme.of(context).colorScheme;
    final iWon = matchOver && snapshot.winnerId == snapshot.myId;
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 440),
        child: Card(
          key: ValueKey(matchOver ? 'match-over' : 'round-over'),
          margin: const EdgeInsets.all(16),
          elevation: 8,
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(18),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Icon(matchOver ? Icons.emoji_events_rounded : Icons.flag_rounded, size: 44, color: kAccent),
                Text(
                  matchOver ? l.t('matchOver') : l.t('roundOver'),
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
                ),
                if (matchOver)
                  Text(
                    iWon ? l.t('youWon') : l.t('matchWinner', {'name': nameForId(snapshot.winnerId, seats, l)}),
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: scheme.primary),
                  ),
                if (result != null) ...[
                  const SizedBox(height: 6),
                  Text(
                    '${l.t('roundWonBy', {'name': nameForId(result.winnerId, seats, l)})} — '
                    '${result.blocked ? l.t('roundBlocked') : l.t('roundDomino')}',
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 12),
                  for (final hand in result.hands)
                    _ResultRow(
                      name: nameForId(hand.playerId, seats, l),
                      winner: hand.playerId == result.winnerId,
                      points: hand.playerId == result.winnerId ? result.points : 0,
                      pips: hand.pips,
                      tiles: hand.tiles,
                      total: snapshot.seat(hand.playerId)?.score ?? 0,
                      target: snapshot.targetScore,
                    ),
                ],
                const SizedBox(height: 16),
                if (!matchOver) ...[
                  FilledButton(
                    key: const ValueKey('next-round'),
                    onPressed: onNextRound,
                    child: Text(l.t('nextRound')),
                  ),
                  if (autoNext)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(l.t('nextRoundAuto'), textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
                    ),
                ] else ...[
                  if (onPlayAgain != null)
                    FilledButton(key: const ValueKey('play-again'), onPressed: onPlayAgain, child: Text(l.t('playAgain'))),
                  const SizedBox(height: 8),
                  OutlinedButton(key: const ValueKey('back-to-menu'), onPressed: onMenu, child: Text(l.t('backToMenu'))),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ResultRow extends StatelessWidget {
  const _ResultRow({
    required this.name,
    required this.winner,
    required this.points,
    required this.pips,
    required this.tiles,
    required this.total,
    required this.target,
  });

  final String name;
  final bool winner;
  final int points;
  final int pips;
  final List<Tile> tiles;
  final int total;
  final int target;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final scheme = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: winner ? scheme.primaryContainer : scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              if (winner) Icon(Icons.star_rounded, color: scheme.primary, size: 20),
              Expanded(child: Text(name, style: const TextStyle(fontWeight: FontWeight.w800), overflow: TextOverflow.ellipsis)),
              if (winner) Text(l.t('gainedPoints', {'n': points}), style: TextStyle(color: scheme.primary, fontWeight: FontWeight.w800)),
              const SizedBox(width: 10),
              ltrText('$total/$target', style: const TextStyle(fontWeight: FontWeight.w700)),
            ],
          ),
          if (tiles.isNotEmpty) ...[
            const SizedBox(height: 6),
            Row(
              children: [
                Text(l.t('remainingPips', {'n': pips}), style: Theme.of(context).textTheme.bodySmall),
                const SizedBox(width: 8),
                Expanded(
                  child: Directionality(
                    textDirection: TextDirection.ltr,
                    child: Wrap(
                      spacing: 3,
                      runSpacing: 3,
                      children: [for (final t in tiles) DominoTile(first: t.a, second: t.b, length: 26)],
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
