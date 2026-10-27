import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';
import '../../state/settings_controller.dart';
import '../widgets/pickers.dart';
import 'rules_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final TextEditingController _name;
  late final TextEditingController _server;

  @override
  void initState() {
    super.initState();
    final settings = SettingsScope.read(context);
    _name = TextEditingController(text: settings.playerName);
    _server = TextEditingController(text: settings.serverUrl);
  }

  @override
  void dispose() {
    _name.dispose();
    _server.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final settings = SettingsScope.of(context);
    const languages = {'ar': 'العربية', 'fr': 'Français', 'en': 'English'};
    return Scaffold(
      appBar: AppBar(title: Text(l.t('settings'))),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
          children: [
            SectionTitle(l.t('language')),
            Card(
              child: RadioGroup<String>(
                groupValue: settings.language,
                onChanged: (v) {
                  if (v != null) settings.setLanguage(v);
                },
                child: Column(
                  children: [
                    for (final entry in languages.entries)
                      RadioListTile<String>(
                        key: ValueKey('lang-${entry.key}'),
                        value: entry.key,
                        title: Text(entry.value, style: const TextStyle(fontWeight: FontWeight.w600)),
                      ),
                  ],
                ),
              ),
            ),
            SectionTitle(l.t('tileStyle')),
            const SkinShortcut(),
            SectionTitle(l.t('playerName')),
            TextField(
              controller: _name,
              maxLength: 20,
              textInputAction: TextInputAction.done,
              decoration: InputDecoration(border: const OutlineInputBorder(), hintText: l.t('you')),
              onChanged: settings.setPlayerName,
            ),
            Card(
              child: Column(
                children: [
                  SwitchListTile(
                    value: settings.sound,
                    onChanged: settings.setSound,
                    title: Text(l.t('sound')),
                    secondary: const Icon(Icons.volume_up_rounded),
                  ),
                  SwitchListTile(
                    value: settings.haptics,
                    onChanged: settings.setHaptics,
                    title: Text(l.t('haptics')),
                    secondary: const Icon(Icons.vibration_rounded),
                  ),
                ],
              ),
            ),
            SectionTitle(l.t('serverUrl')),
            TextField(
              controller: _server,
              keyboardType: TextInputType.url,
              textDirection: TextDirection.ltr,
              decoration: InputDecoration(border: const OutlineInputBorder(), helperText: l.t('serverUrlHint')),
              onSubmitted: settings.setServerUrl,
              onChanged: settings.setServerUrl,
            ),
            const SizedBox(height: 16),
            ListTile(
              leading: const Icon(Icons.menu_book_rounded),
              title: Text(l.t('rules')),
              onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const RulesScreen())),
            ),
          ],
        ),
      ),
    );
  }
}
