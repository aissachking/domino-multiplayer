import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../ai/bot.dart';
import '../../l10n/app_localizations.dart';
import '../../net/protocol.dart';
import '../../net/transport.dart';
import '../../state/online_controller.dart';
import '../../state/settings_controller.dart';
import '../../state/table_session.dart';
import '../widgets/pickers.dart';
import '../widgets/table_widgets.dart';
import 'game_screen.dart';

typedef TransportFactory = RealtimeTransport Function(SettingsController settings);

/// Mode A / C: online rooms (create, join by code, waiting room).
class OnlineScreen extends StatefulWidget {
  const OnlineScreen({super.key, this.transportFactory});

  final TransportFactory? transportFactory;

  @override
  State<OnlineScreen> createState() => _OnlineScreenState();
}

class _OnlineScreenState extends State<OnlineScreen> {
  OnlineController? _controller;
  final _code = TextEditingController();
  late final TextEditingController _name;
  bool _inGame = false;
  Difficulty _botLevel = Difficulty.normal;

  @override
  void initState() {
    super.initState();
    final settings = SettingsScope.read(context);
    _name = TextEditingController(text: settings.playerName);
    _botLevel = settings.difficulty;
    final transport = widget.transportFactory?.call(settings) ??
        SocketIoTransport(url: settings.serverUrl, playerId: settings.playerId, token: settings.token);
    _controller = OnlineController(transport: transport, myId: settings.playerId)..addListener(_onChange);
    _controller!.connect();
  }

  @override
  void dispose() {
    _controller?.removeListener(_onChange);
    _controller?.dispose();
    _code.dispose();
    _name.dispose();
    super.dispose();
  }

  void _onChange() {
    if (!mounted) return;
    final c = _controller!;
    if (!_inGame) {
      final error = c.takeError();
      if (error != null) {
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(content: Text(context.l10n.error(error))));
      }
    }
    final room = c.room;
    if (!_inGame && room != null && !room.inLobby && c.snapshot != null) {
      _inGame = true;
      Navigator.of(context)
          .push(MaterialPageRoute<void>(builder: (_) => GameScreen(session: c)))
          .then((_) => _inGame = false);
    }
    setState(() {});
  }

  String get _playerName {
    final settings = SettingsScope.read(context);
    final name = _name.text.trim();
    if (name != settings.playerName) settings.setPlayerName(name);
    return name.isEmpty ? context.l10n.t('you') : name;
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = _controller!;
    final room = c.room;
    return PopScope(
      canPop: room == null,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        await c.leave();
        if (context.mounted) Navigator.of(context).pop();
      },
      child: Scaffold(
        appBar: AppBar(title: Text(room == null ? l.t('playOnline') : l.t('roomCode'))),
        body: Column(
          children: [
            ConnectionBanner(status: c.connection, onRetry: c.connect),
            Expanded(child: room == null ? _entry(context, c) : _lobby(context, c, room)),
          ],
        ),
      ),
    );
  }

  Widget _entry(BuildContext context, OnlineController c) {
    final l = context.l10n;
    final settings = SettingsScope.of(context);
    final ready = c.connection == ConnectionStatus.connected && !c.busy;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
      children: [
        SectionTitle(l.t('playerName')),
        TextField(
          key: const ValueKey('name-field'),
          controller: _name,
          maxLength: 20,
          decoration: InputDecoration(border: const OutlineInputBorder(), hintText: l.t('you')),
        ),
        SectionTitle(l.t('createRoom')),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(l.t('targetScore'), style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                TargetScorePicker(value: settings.targetScore, onChanged: settings.setTargetScore),
                const SizedBox(height: 12),
                FilledButton.icon(
                  key: const ValueKey('create-room'),
                  onPressed: ready ? () => c.createRoom(_playerName, settings.targetScore) : null,
                  icon: const Icon(Icons.add_home_rounded),
                  label: Text(l.t('createRoom')),
                ),
              ],
            ),
          ),
        ),
        SectionTitle(l.t('joinRoom')),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextField(
                  key: const ValueKey('code-field'),
                  controller: _code,
                  textCapitalization: TextCapitalization.characters,
                  textDirection: TextDirection.ltr,
                  textAlign: TextAlign.center,
                  maxLength: 5,
                  style: const TextStyle(fontSize: 26, letterSpacing: 8, fontWeight: FontWeight.w800),
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9]')),
                    TextInputFormatter.withFunction((o, n) => n.copyWith(text: n.text.toUpperCase())),
                  ],
                  decoration: InputDecoration(border: const OutlineInputBorder(), hintText: l.t('roomCodeHint'), hintStyle: const TextStyle(fontSize: 14, letterSpacing: 0)),
                ),
                const SizedBox(height: 8),
                FilledButton.tonalIcon(
                  key: const ValueKey('join-room'),
                  onPressed: ready ? () => c.joinRoom(_code.text, _playerName) : null,
                  icon: const Icon(Icons.login_rounded),
                  label: Text(l.t('join')),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        const SkinShortcut(),
      ],
    );
  }

  Widget _lobby(BuildContext context, OnlineController c, RoomInfo room) {
    final l = context.l10n;
    final scheme = Theme.of(context).colorScheme;
    final isHost = c.isHost;
    final me = c.meInRoom;
    final humansReady = room.players.where((p) => !p.isBot && !p.isHost).every((p) => p.ready && p.connected);
    final canStart = isHost && room.players.length >= 2 && humansReady && !c.busy;
    var botNumber = 0;
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
            children: [
              Card(
                color: scheme.primaryContainer,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Text(l.t('roomCode'), style: const TextStyle(fontWeight: FontWeight.w700)),
                      Directionality(
                        textDirection: TextDirection.ltr,
                        child: SelectableText(
                          room.code,
                          key: const ValueKey('room-code'),
                          style: const TextStyle(fontSize: 40, letterSpacing: 10, fontWeight: FontWeight.w800),
                        ),
                      ),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          TextButton.icon(
                            onPressed: () async {
                              await Clipboard.setData(ClipboardData(text: room.code));
                              if (!context.mounted) return;
                              ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l.t('copied'))));
                            },
                            icon: const Icon(Icons.copy_rounded),
                            label: Text(l.t('copy')),
                          ),
                          TextButton.icon(
                            key: const ValueKey('share-invite'),
                            onPressed: () async {
                              await Clipboard.setData(ClipboardData(text: l.t('shareText', {'code': room.code})));
                              if (!context.mounted) return;
                              ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l.t('copied'))));
                            },
                            icon: const Icon(Icons.share_rounded),
                            label: Text(l.t('share')),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              SectionTitle(l.t('playersN', {'n': room.players.length})),
              for (final p in room.players)
                Card(
                  child: ListTile(
                    leading: CircleAvatar(
                      child: Icon(p.isBot ? Icons.smart_toy_rounded : (p.connected ? Icons.person_rounded : Icons.wifi_off_rounded)),
                    ),
                    title: Text(
                      p.isBot
                          ? '${l.t('bot')} ${++botNumber}'
                          : (p.id == c.myId ? '${p.name} (${l.t('you')})' : p.name),
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    subtitle: Text([
                      if (p.isHost) l.t('host'),
                      if (p.isBot) l.t('diff_${p.difficulty ?? 'normal'}'),
                      if (!p.isBot && !p.isHost) (p.ready ? l.t('ready') : l.t('notReady')),
                      if (!p.isBot && !p.connected) l.t('disconnected'),
                    ].join(' • ')),
                    trailing: p.isBot && isHost
                        ? IconButton(
                            tooltip: l.t('removeBot'),
                            icon: const Icon(Icons.remove_circle_outline_rounded),
                            onPressed: c.busy ? null : () => c.removeBot(p.id),
                          )
                        : (!p.isBot && (p.ready || p.isHost) ? Icon(Icons.check_circle_rounded, color: scheme.primary) : null),
                  ),
                ),
              if (isHost && room.players.length < 4) ...[
                const SizedBox(height: 8),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        DifficultyPicker(value: _botLevel, onChanged: (d) => setState(() => _botLevel = d)),
                        const SizedBox(height: 8),
                        OutlinedButton.icon(
                          key: const ValueKey('add-bot'),
                          onPressed: c.busy ? null : () => c.addBot(_botLevel),
                          icon: const Icon(Icons.add_rounded),
                          label: Text(l.t('addBot')),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
              SectionTitle(l.t('targetScore')),
              TargetScorePicker(value: room.targetScore, onChanged: isHost && !c.busy ? c.setTargetScore : null),
              const SizedBox(height: 12),
              const SkinShortcut(),
            ],
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: SizedBox(
              width: double.infinity,
              child: isHost
                  ? FilledButton.icon(
                      key: const ValueKey('start-online'),
                      onPressed: canStart ? c.startMatch : null,
                      icon: const Icon(Icons.play_arrow_rounded),
                      label: Text(room.players.length < 2 ? l.t('needPlayers') : l.t('startGame')),
                    )
                  : FilledButton.icon(
                      key: const ValueKey('toggle-ready'),
                      onPressed: c.busy || me == null ? null : () => c.setReady(!(me.ready)),
                      icon: Icon(me?.ready == true ? Icons.hourglass_top_rounded : Icons.check_rounded),
                      label: Text(me?.ready == true ? l.t('waitingHost') : l.t('imReady')),
                    ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Exposed for tests.
bool isValidRoomCode(String input) => roomCodePattern.hasMatch(normalizeRoomCode(input));
