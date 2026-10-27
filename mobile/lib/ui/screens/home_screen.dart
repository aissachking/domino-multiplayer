import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';
import '../../state/offline_session.dart';
import '../../state/settings_controller.dart';
import '../theme.dart';
import '../widgets/domino_tile.dart';
import 'game_screen.dart';
import 'offline_setup_screen.dart';
import 'online_screen.dart';
import 'rules_screen.dart';
import 'settings_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  bool _corruptHandled = false;

  Future<void> _open(Widget screen) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));
    if (mounted) setState(() {}); // refresh the resume card
  }

  Future<void> _resume() async {
    final settings = SettingsScope.read(context);
    final json = settings.savedGameJson;
    if (json == null) return;
    try {
      final session = OfflineSession.restore(json, saver: (data) => data == null ? settings.clearSavedGame() : settings.writeSavedGame(data));
      await _open(GameScreen(session: session, ownsSession: true));
    } catch (_) {
      await settings.clearSavedGame();
      if (!mounted) return;
      setState(() {});
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.l10n.t('saveCorrupt'))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final settings = SettingsScope.of(context);
    final saved = OfflineSession.peek(settings.savedGameJson);
    final hasCorruptSave = settings.savedGameJson != null && saved == null;
    if (hasCorruptSave && !_corruptHandled) {
      _corruptHandled = true;
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        await settings.clearSavedGame();
        if (!mounted) return;
        _corruptHandled = false;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l.t('saveCorrupt'))));
      });
    }
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [kFeltDark, kFelt],
          ),
        ),
        child: SafeArea(
          child: LayoutBuilder(
            builder: (context, constraints) => SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: constraints.maxHeight - 32),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 480),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            IconButton(
                              tooltip: l.t('rules'),
                              onPressed: () => _open(const RulesScreen()),
                              icon: const Icon(Icons.help_outline_rounded, color: Colors.white70),
                            ),
                            IconButton(
                              key: const ValueKey('open-settings'),
                              tooltip: l.t('settings'),
                              onPressed: () => _open(const SettingsScreen()),
                              icon: const Icon(Icons.settings_rounded, color: Colors.white70),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        const _Logo(),
                        const SizedBox(height: 16),
                        Text(
                          l.t('appName'),
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Colors.white, fontSize: 44, fontWeight: FontWeight.w800, height: 1.2),
                        ),
                        Text(
                          l.t('tagline'),
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Colors.white70, fontSize: 17),
                        ),
                        const SizedBox(height: 32),
                        if (saved != null) ...[
                          _MenuButton(
                            key: const ValueKey('resume'),
                            icon: Icons.play_circle_fill_rounded,
                            title: l.t('resumeGame'),
                            subtitle: l.t('resumeHint', {'round': saved.round, 'score': saved.score}),
                            highlighted: true,
                            onTap: _resume,
                          ),
                          const SizedBox(height: 12),
                        ],
                        _MenuButton(
                          key: const ValueKey('play-bots'),
                          icon: Icons.smart_toy_rounded,
                          title: l.t('playBots'),
                          subtitle: l.t('playBotsHint'),
                          onTap: () => _open(const OfflineSetupScreen()),
                        ),
                        const SizedBox(height: 12),
                        _MenuButton(
                          key: const ValueKey('play-online'),
                          icon: Icons.groups_rounded,
                          title: l.t('playOnline'),
                          subtitle: l.t('playOnlineHint'),
                          onTap: () => _open(const OnlineScreen()),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Logo extends StatelessWidget {
  const _Logo();

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(
      child: Directionality(
        textDirection: TextDirection.ltr,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Transform.rotate(angle: -0.25, child: const DominoTile(first: 6, second: 6, length: 96)),
            const SizedBox(width: 10),
            Transform.rotate(angle: 0.2, child: const DominoTile(first: 3, second: 5, length: 96)),
          ],
        ),
      ),
    );
  }
}

class _MenuButton extends StatelessWidget {
  const _MenuButton({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.highlighted = false,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    final fg = highlighted ? const Color(0xFF3A2600) : const Color(0xFF123B2E);
    return Material(
      color: highlighted ? kAccent : Colors.white,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
          child: Row(
            children: [
              Icon(icon, size: 34, color: fg),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: fg)),
                    Text(subtitle, style: TextStyle(fontSize: 14, color: fg.withValues(alpha: 0.75))),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
