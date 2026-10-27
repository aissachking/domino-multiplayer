import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../engine/models.dart';
import '../../l10n/app_localizations.dart';
import '../../state/offline_session.dart';
import '../../state/online_controller.dart';
import '../../state/settings_controller.dart';
import '../../state/table_session.dart';
import '../theme.dart';
import '../widgets/board_view.dart';
import '../widgets/domino_tile.dart';
import '../widgets/table_widgets.dart';

/// The domino table, shared by offline and online games.
class GameScreen extends StatefulWidget {
  const GameScreen({super.key, required this.session, this.ownsSession = false});

  final TableSession session;

  /// Offline sessions are created for this screen and disposed with it.
  final bool ownsSession;

  @override
  State<GameScreen> createState() => _GameScreenState();
}

class _GameScreenState extends State<GameScreen> {
  String? _selectedTileId;
  int _lastVersion = -1;
  bool _wasMyTurn = false;

  TableSession get session => widget.session;

  @override
  void initState() {
    super.initState();
    session.addListener(_onSession);
    _lastVersion = session.snapshot?.version ?? -1;
    _wasMyTurn = session.snapshot?.isMyTurn ?? false;
  }

  @override
  void dispose() {
    session.removeListener(_onSession);
    if (widget.ownsSession) session.dispose();
    super.dispose();
  }

  void _onSession() {
    if (!mounted) return;
    final settings = SettingsScope.read(context);
    final snap = session.snapshot;
    final error = session.takeError();
    if (error != null) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(context.l10n.error(error)), duration: const Duration(seconds: 2)));
      if (settings.haptics) HapticFeedback.heavyImpact();
    }
    if (snap != null && snap.version != _lastVersion) {
      _lastVersion = snap.version;
      if (settings.sound && snap.lastAction != null) SystemSound.play(SystemSoundType.click);
      if (snap.isMyTurn && !_wasMyTurn && settings.haptics) HapticFeedback.mediumImpact();
      _wasMyTurn = snap.isMyTurn;
      // drop a selection that is no longer valid
      if (_selectedTileId != null && !snap.hand.any((t) => t.id == _selectedTileId)) _selectedTileId = null;
      if (!snap.isMyTurn) _selectedTileId = null;
    }
    final s = session;
    if (s is OnlineController && s.closed) {
      Navigator.of(context).popUntil((r) => r.isFirst);
      return;
    }
    setState(() {});
  }

  void _onTileTap(Tile tile) {
    final snap = session.snapshot;
    if (snap == null || session.busy) return;
    final l = context.l10n;
    final settings = SettingsScope.read(context);
    if (!snap.isMyTurn) {
      _toast(l.error('NOT_YOUR_TURN'));
      return;
    }
    final ends = snap.endsFor(tile);
    if (ends.isEmpty) {
      if (snap.board.isEmpty && snap.openingTileId != null) {
        _toast(l.t('mustOpenWith', {'tile': snap.openingTileId}));
      } else {
        _toast(l.error('ILLEGAL_MOVE'));
      }
      if (settings.haptics) HapticFeedback.lightImpact();
      return;
    }
    final sameEnds = snap.board.isNotEmpty && snap.board.first.left == snap.board.last.right;
    if (ends.length == 1 || sameEnds) {
      _selectedTileId = null;
      if (settings.haptics) HapticFeedback.selectionClick();
      session.play(tile.id, ends.last);
      return;
    }
    setState(() => _selectedTileId = _selectedTileId == tile.id ? null : tile.id);
  }

  void _playSelected(BoardEnd end) {
    final id = _selectedTileId;
    if (id == null) return;
    setState(() => _selectedTileId = null);
    if (SettingsScope.read(context).haptics) HapticFeedback.selectionClick();
    session.play(id, end);
  }

  void _toast(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message), duration: const Duration(milliseconds: 1600)));
  }

  Future<void> _confirmLeave() async {
    final l = context.l10n;
    final snap = session.snapshot;
    final finished = snap == null || snap.phase == Phase.matchOver;
    if (!finished) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(l.t('leaveTitle')),
          content: Text(session.isOnline ? l.t('leaveOnline') : l.t('leaveOffline')),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l.t('cancel'))),
            FilledButton(key: const ValueKey('confirm-leave'), onPressed: () => Navigator.pop(context, true), child: Text(l.t('leave'))),
          ],
        ),
      );
      if (ok != true || !mounted) return;
    }
    await _leaveToMenu();
  }

  Future<void> _leaveToMenu() async {
    await session.leave();
    if (!mounted) return;
    Navigator.of(context).popUntil((r) => r.isFirst);
  }

  void _playAgain() {
    final settings = SettingsScope.read(context);
    final next = OfflineSession.start(
      botCount: settings.botCount,
      difficulty: settings.difficulty,
      targetScore: settings.targetScore,
      myName: settings.playerName,
      saver: (data) => data == null ? settings.clearSavedGame() : settings.writeSavedGame(data),
    );
    Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(builder: (_) => GameScreen(session: next, ownsSession: true)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final snap = session.snapshot;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _confirmLeave();
      },
      child: Scaffold(
        backgroundColor: kFeltDark,
        appBar: AppBar(
          backgroundColor: kFeltDark,
          foregroundColor: Colors.white,
          leading: IconButton(
            key: const ValueKey('leave-game'),
            tooltip: l.t('leave'),
            icon: const Icon(Icons.close_rounded),
            onPressed: _confirmLeave,
          ),
          title: Text(
            snap == null ? l.t('appName') : '${l.t('roundN', {'n': snap.round})} • ${l.t('pointsN', {'n': snap.targetScore})}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w700),
          ),
          actions: [
            Padding(
              padding: const EdgeInsetsDirectional.only(end: 12),
              child: Chip(
                visualDensity: VisualDensity.compact,
                avatar: Icon(session.isOnline ? Icons.public_rounded : Icons.wifi_off_rounded, size: 16),
                label: Text(session.isOnline ? l.t('online') : l.t('offline')),
              ),
            ),
          ],
        ),
        body: Column(
          children: [
            if (session.isOnline)
              ConnectionBanner(
                status: session.connection,
                onRetry: () {
                  final s = session;
                  if (s is OnlineController) s.connect();
                },
              ),
            Expanded(child: snap == null ? const Center(child: CircularProgressIndicator()) : _table(context, snap)),
          ],
        ),
      ),
    );
  }

  Widget _table(BuildContext context, TableSnapshot snap) {
    final l = context.l10n;
    final others = snap.seats.where((s) => !s.isMe).toList();
    final me = snap.me;
    final selected = snap.hand.where((t) => t.id == _selectedTileId).firstOrNull;
    final selectedEnds = selected == null ? const <BoardEnd>[] : snap.endsFor(selected);
    final showOverlay = snap.phase != Phase.playing;

    return SafeArea(
      top: false,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final compact = constraints.maxHeight < 520;
          final handTile = (constraints.maxHeight * (compact ? 0.16 : 0.13)).clamp(52.0, 92.0).toDouble();
          return Column(
            children: [
              // opponents
              SizedBox(
                height: compact ? 58 : 66,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  itemCount: others.length,
                  separatorBuilder: (context, index) => const SizedBox(width: 8),
                  itemBuilder: (context, i) => SeatChip(
                    seat: others[i],
                    seats: snap.seats,
                    active: snap.phase == Phase.playing && snap.currentPlayerId == others[i].id,
                    target: snap.targetScore,
                  ),
                ),
              ),
              // board
              Expanded(
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 8),
                  decoration: BoxDecoration(
                    gradient: const RadialGradient(colors: [Color(0xFF1E7458), kFelt], radius: 1.1),
                    borderRadius: BorderRadius.circular(22),
                    border: Border.all(color: const Color(0xFF0A2A20), width: 3),
                  ),
                  child: Stack(
                    children: [
                      Positioned.fill(
                        child: BoardView(
                          board: snap.board,
                          highlightEnds: selectedEnds,
                          onEndTap: _playSelected,
                          emptyHint: snap.isMyTurn
                              ? (snap.openingTileId != null ? l.t('mustOpenWith', {'tile': snap.openingTileId}) : l.t('yourTurn'))
                              : l.t('turnOf', {'name': nameForId(snap.currentPlayerId, snap.seats, l)}),
                        ),
                      ),
                      PositionedDirectional(
                        top: 8,
                        start: 10,
                        child: _stockBadge(l, snap),
                      ),
                      if (showOverlay)
                        Positioned.fill(
                          child: ColoredBox(
                            color: Colors.black45,
                            child: RoundResultPanel(
                              snapshot: snap,
                              autoNext: session.autoNextRound,
                              onNextRound: session.nextRound,
                              onPlayAgain: session.isOnline ? null : _playAgain,
                              onMenu: _leaveToMenu,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              // status + actions
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
                child: _statusRow(context, snap, selectedEnds),
              ),
              // my hand
              Container(
                width: double.infinity,
                padding: const EdgeInsets.only(top: 8, bottom: 10),
                decoration: BoxDecoration(
                  color: snap.isMyTurn ? const Color(0xFF235D49) : const Color(0xFF123B2E),
                  border: Border(top: BorderSide(color: snap.isMyTurn ? kAccent : Colors.transparent, width: 3)),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (me != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(l.t('you'), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                            const SizedBox(width: 8),
                            ltrText('${me.score}/${snap.targetScore}',
                                style: const TextStyle(color: kAccent, fontWeight: FontWeight.w800)),
                          ],
                        ),
                      ),
                    SizedBox(
                      height: handTile + 14,
                      child: Directionality(
                        textDirection: TextDirection.ltr,
                        child: Center(
                          child: ListView(
                            key: const ValueKey('hand'),
                            scrollDirection: Axis.horizontal,
                            shrinkWrap: true,
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            children: [
                              for (final tile in snap.hand)
                                Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 4),
                                  child: AnimatedSlide(
                                    duration: const Duration(milliseconds: 150),
                                    offset: Offset(0, tile.id == _selectedTileId ? -0.12 : 0),
                                    child: DominoTile(
                                      key: ValueKey('hand-${tile.id}'),
                                      first: tile.a,
                                      second: tile.b,
                                      length: handTile,
                                      selected: tile.id == _selectedTileId,
                                      highlighted: snap.isMyTurn && snap.canPlay(tile),
                                      dimmed: snap.isMyTurn && !snap.canPlay(tile),
                                      onTap: () => _onTileTap(tile),
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _stockBadge(S l, TableSnapshot snap) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: Colors.black26, borderRadius: BorderRadius.circular(12)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const DominoTile.back(length: 18),
          const SizedBox(width: 6),
          Text(l.t('stockN', {'n': snap.stockCount}), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }

  Widget _statusRow(BuildContext context, TableSnapshot snap, List<BoardEnd> selectedEnds) {
    final l = context.l10n;
    final busy = session.busy;
    final String message;
    if (snap.phase != Phase.playing) {
      message = l.t('roundOver');
    } else if (!snap.isMyTurn) {
      message = l.t('turnOf', {'name': nameForId(snap.currentPlayerId, snap.seats, l)});
    } else if (selectedEnds.length == 2) {
      message = l.t('chooseEnd');
    } else if (snap.mustDraw) {
      message = l.t('noMoveDraw');
    } else if (snap.mustPass) {
      message = l.t('noMovePass');
    } else if (snap.board.isEmpty && snap.openingTileId != null) {
      message = l.t('mustOpenWith', {'tile': snap.openingTileId});
    } else {
      message = l.t('yourTurn');
    }
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            if (busy || (!snap.isMyTurn && snap.phase == Phase.playing))
              const Padding(
                padding: EdgeInsetsDirectional.only(end: 8),
                child: SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white70)),
              ),
            Expanded(
              child: Text(
                message,
                key: const ValueKey('status'),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: snap.isMyTurn ? kAccent : Colors.white,
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                ),
              ),
            ),
            if (snap.isMyTurn && snap.mustDraw)
              FilledButton.icon(
                key: const ValueKey('draw'),
                onPressed: busy ? null : session.draw,
                style: FilledButton.styleFrom(backgroundColor: kAccent, foregroundColor: const Color(0xFF3A2600)),
                icon: const Icon(Icons.download_rounded),
                label: Text(l.t('draw')),
              ),
            if (snap.isMyTurn && snap.mustPass)
              FilledButton.icon(
                key: const ValueKey('pass'),
                onPressed: busy ? null : session.pass,
                style: FilledButton.styleFrom(backgroundColor: kAccent, foregroundColor: const Color(0xFF3A2600)),
                icon: const Icon(Icons.skip_next_rounded),
                label: Text(l.t('pass')),
              ),
          ],
        ),
        if (selectedEnds.length == 2) ...[
          const SizedBox(height: 6),
          Directionality(
            textDirection: TextDirection.ltr,
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    key: const ValueKey('end-left'),
                    style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: kAccent)),
                    onPressed: () => _playSelected(BoardEnd.left),
                    icon: const Icon(Icons.arrow_back_rounded),
                    label: Text('${l.t('leftEnd')} (${snap.board.first.left})', overflow: TextOverflow.ellipsis),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    key: const ValueKey('end-right'),
                    style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: kAccent)),
                    onPressed: () => _playSelected(BoardEnd.right),
                    icon: const Icon(Icons.arrow_forward_rounded),
                    label: Text('${l.t('rightEnd')} (${snap.board.last.right})', overflow: TextOverflow.ellipsis),
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}
