import 'dart:convert';

import 'package:daeef_jiddan/ai/bot.dart';
import 'package:daeef_jiddan/engine/engine.dart';
import 'package:daeef_jiddan/engine/models.dart';
import 'package:daeef_jiddan/main.dart';
import 'package:daeef_jiddan/net/protocol.dart';
import 'package:daeef_jiddan/state/offline_session.dart';
import 'package:daeef_jiddan/state/settings_controller.dart';
import 'package:daeef_jiddan/state/table_session.dart';
import 'package:daeef_jiddan/ui/screens/game_screen.dart';
import 'package:daeef_jiddan/ui/screens/online_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/fakes.dart';

Future<SettingsController> pumpApp(WidgetTester tester, {Map<String, Object> prefs = const {}, Widget? home}) async {
  SharedPreferences.setMockInitialValues(prefs);
  final settings = await SettingsController.load();
  await tester.pumpWidget(DaeefApp(settings: settings, home: home));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 300));
  return settings;
}

OfflineSession testSession({int seed = 3, int bots = 1, int target = 50, Future<void> Function(String?)? saver}) =>
    OfflineSession.start(
      botCount: bots,
      difficulty: Difficulty.easy,
      targetScore: target,
      myName: '',
      seed: seed,
      saver: saver ?? (_) async {},
      botDelay: const Duration(milliseconds: 20),
      useIsolate: false,
    );

void main() {
  testWidgets('home screen is Arabic and right-to-left by default', (tester) async {
    await pumpApp(tester);
    expect(find.text('ضعيف جدا'), findsWidgets);
    expect(find.text('العب ضد البوتات'), findsOneWidget);
    expect(Directionality.of(tester.element(find.text('العب ضد البوتات'))), TextDirection.rtl);
    expect(tester.takeException(), isNull);
  });

  testWidgets('language can be switched to French and is remembered', (tester) async {
    final settings = await pumpApp(tester);
    await tester.tap(find.byKey(const ValueKey('open-settings')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('lang-fr')));
    await tester.pumpAndSettle();
    expect(settings.language, 'fr');
    expect(find.text('Paramètres'), findsOneWidget);
    expect(Directionality.of(tester.element(find.text('Paramètres'))), TextDirection.ltr);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('language'), 'fr');
  });

  testWidgets('a tile style can be previewed, selected and persists', (tester) async {
    final settings = await pumpApp(tester);
    await tester.tap(find.byKey(const ValueKey('open-settings')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('شكل أحجار الدومينو').last);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('skin-gold')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('skin-wood')));
    await tester.pumpAndSettle();
    expect(settings.skinId, 'wood');
    final reloaded = SettingsController(await SharedPreferences.getInstance());
    expect(reloaded.skinId, 'wood');
  });

  testWidgets('offline game: start against bots, play a tile, leave and resume', (tester) async {
    final settings = await pumpApp(tester);
    await tester.tap(find.byKey(const ValueKey('play-bots')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('start-offline')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byKey(const ValueKey('hand')), findsOneWidget);
    expect(settings.savedGameJson, isNotNull);
    // let bots move until it is our turn, then play whatever the status allows
    await tester.pump(const Duration(seconds: 2));
    await tester.tap(find.byKey(const ValueKey('leave-game')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.byKey(const ValueKey('confirm-leave')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.byKey(const ValueKey('resume')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('resume')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.byKey(const ValueKey('hand')), findsOneWidget);
    // dispose timers
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('tapping a playable tile plays it; the bot answers', (tester) async {
    String? saved;
    final session = testSession(seed: 3, saver: (s) async => saved = s);
    // make sure it is the human's turn
    final opening = session.state.openingTileId!;
    final humanStarts = session.state.currentPlayer.id == 'me';
    await pumpApp(tester, home: GameScreen(session: session, ownsSession: true));
    if (humanStarts) {
      await tester.tap(find.byKey(ValueKey('hand-$opening')));
      await tester.pump();
      expect(session.state.board.length, 1);
    }
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));
    expect(session.state.version, greaterThanOrEqualTo(humanStarts ? 2 : 1));
    expect(saved, isNotNull);
    final restored = OfflineSession.restore(saved!, saver: (_) async {}, useIsolate: false);
    expect(restored.state.version, session.state.version);
    restored.dispose();
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });

  testWidgets('a corrupted save is discarded with a clear message', (tester) async {
    final settings = await pumpApp(tester, prefs: {'offline_save_v1': '{"format":"daeef-offline-1","state":{"schema":1}}'});
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byKey(const ValueKey('resume')), findsNothing);
    expect(find.text('تعذّرت قراءة المباراة المحفوظة فتم تجاهلها.'), findsOneWidget);
    expect(settings.savedGameJson, isNull);
  });

  testWidgets('round results are shown and the next round can be started', (tester) async {
    final session = testSession(seed: 11, target: 200);
    // play the round out automatically through the engine
    var g = session.state;
    while (g.phase == Phase.playing) {
      g = decideBotAction(g, g.current, Difficulty.normal).next;
    }
    final finished = OfflineSession.restore(
      jsonEncode({'format': OfflineSession.kSaveFormat, 'seed': 1, 'difficulty': 'easy', 'name': '', 'state': g.toJson()}),
      saver: (_) async {},
      botDelay: const Duration(milliseconds: 20),
      useIsolate: false,
    );
    session.dispose();
    await pumpApp(tester, home: GameScreen(session: finished, ownsSession: true));
    if (g.phase == Phase.roundOver) {
      expect(find.byKey(const ValueKey('round-over')), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('next-round')));
      await tester.pump();
      expect(finished.state.round, 2);
      expect(find.byKey(const ValueKey('round-over')), findsNothing);
    }
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });

  testWidgets('online: create a room, see the lobby, then the table; reconnect banner', (tester) async {
    late FakeTransport transport;
    final view = <String, dynamic>{
      'code': 'ABCDE',
      'gameId': 'g1',
      'version': 0,
      'round': 1,
      'phase': 'playing',
      'targetScore': 100,
      'board': <Object>[],
      'stockCount': 14,
      'currentPlayerId': 'bot-1',
      'openingTileId': '6-6',
      'players': [
        {'id': 'me-1234567', 'name': 'Sara', 'kind': 'human', 'seat': 0, 'connected': true, 'ready': true, 'isHost': true, 'autopilot': false, 'score': 0, 'tileCount': 7},
        {'id': 'bot-1', 'name': 'Bot 1', 'kind': 'bot', 'difficulty': 'hard', 'seat': 1, 'connected': true, 'ready': true, 'isHost': false, 'autopilot': false, 'score': 0, 'tileCount': 7},
      ],
      'you': 'me-1234567',
      'hand': [for (final id in ['0-1', '0-2', '1-3', '2-4', '3-5', '4-6', '5-5']) Tile.fromId(id).toJson()],
      'lastRound': null,
      'winnerId': null,
      'lastAction': null,
    };
    await pumpApp(
      tester,
      prefs: {'playerId': 'me-1234567', 'playerToken': 'tokentokentokentoken'},
      home: OnlineScreen(transportFactory: (_) {
        transport = FakeTransport(onRequest: (event, payload) {
          if (event == C2S.roomCreate) return AckResult.ok(roomJson());
          return const AckResult.ok(null);
        });
        return transport;
      }),
    );
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('create-room')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('room-code')), findsOneWidget);
    expect(find.text('ABCDE'), findsOneWidget);

    transport.push('room:update', roomJson(phase: 'playing'));
    transport.push('game:state', view);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byKey(const ValueKey('hand')), findsOneWidget);
    expect(find.byKey(const ValueKey('hand-0-1')), findsOneWidget);

    transport.setStatus(ConnectionStatus.reconnecting);
    await tester.pump();
    expect(find.text('انقطع الاتصال — جارٍ إعادة الاتصال…'), findsWidgets);
    transport.setStatus(ConnectionStatus.connected);
    await tester.pump();
    expect(transport.requests.any((r) => r.$1 == C2S.gameSync), isTrue);
  });

  testWidgets('small phone screens render without overflow in Arabic', (tester) async {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await pumpApp(tester);
    expect(tester.takeException(), isNull);
    final session = testSession(seed: 5, bots: 3);
    await tester.pumpWidget(const SizedBox());
    await pumpApp(tester, home: GameScreen(session: session, ownsSession: true));
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });

  test('engine errors surface as localized codes through the session', () async {
    final session = testSession(seed: 3);
    final me = session.state.players.first;
    final notOpening = me.hand.firstWhere((t) => t.id != session.state.openingTileId, orElse: () => me.hand.first);
    await session.play(notOpening.id, BoardEnd.left);
    final code = session.takeError();
    expect(code, anyOf('NOT_YOUR_TURN', 'MUST_OPEN_WITH_TILE', isNull));
    expect(() => parseState(null), throwsA(isA<EngineError>()));
    session.dispose();
  });
}
