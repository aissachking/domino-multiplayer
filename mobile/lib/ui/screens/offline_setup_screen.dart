import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';
import '../../state/offline_session.dart';
import '../../state/settings_controller.dart';
import '../widgets/pickers.dart';
import 'game_screen.dart';

/// Mode B / D: one human against 1–3 bots, fully offline.
class OfflineSetupScreen extends StatelessWidget {
  const OfflineSetupScreen({super.key});

  void _start(BuildContext context) {
    final settings = SettingsScope.read(context);
    final session = OfflineSession.start(
      botCount: settings.botCount,
      difficulty: settings.difficulty,
      targetScore: settings.targetScore,
      myName: settings.playerName,
      saver: (data) => data == null ? settings.clearSavedGame() : settings.writeSavedGame(data),
    );
    Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(builder: (_) => GameScreen(session: session, ownsSession: true)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final settings = SettingsScope.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l.t('playBots'))),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                children: [
                  if (settings.savedGameJson != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Row(
                        children: [
                          Icon(Icons.info_outline_rounded, color: Theme.of(context).colorScheme.tertiary),
                          const SizedBox(width: 8),
                          Expanded(child: Text(l.t('resumeOrNew'))),
                        ],
                      ),
                    ),
                  SectionTitle(l.t('botCount')),
                  SegmentedButton<int>(
                    segments: [
                      for (final n in [1, 2, 3])
                        ButtonSegment(value: n, label: Text('$n'), icon: const Icon(Icons.smart_toy_outlined)),
                    ],
                    selected: {settings.botCount},
                    onSelectionChanged: (s) => settings.setBotCount(s.first),
                  ),
                  Padding(
                    padding: const EdgeInsetsDirectional.only(top: 6, start: 4),
                    child: Text(l.t('humansAndBots', {'n': settings.botCount})),
                  ),
                  SectionTitle(l.t('difficulty')),
                  DifficultyPicker(value: settings.difficulty, onChanged: settings.setDifficulty),
                  SectionTitle(l.t('targetScore')),
                  TargetScorePicker(value: settings.targetScore, onChanged: settings.setTargetScore),
                  SectionTitle(l.t('tileStyle')),
                  const SkinShortcut(),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  key: const ValueKey('start-offline'),
                  onPressed: () => _start(context),
                  icon: const Icon(Icons.play_arrow_rounded),
                  label: Text(l.t('startGame')),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
