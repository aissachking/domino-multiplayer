import 'package:flutter/material.dart';

import '../../ai/bot.dart';
import '../../engine/models.dart';
import '../../l10n/app_localizations.dart';
import '../../state/settings_controller.dart';
import '../screens/skin_picker_screen.dart';
import 'domino_tile.dart';

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsetsDirectional.only(top: 20, bottom: 8, start: 4),
        child: Text(text, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
      );
}

class TargetScorePicker extends StatelessWidget {
  const TargetScorePicker({super.key, required this.value, required this.onChanged});
  final int value;
  final ValueChanged<int>? onChanged;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final t in kTargetScores)
          ChoiceChip(
            label: Text(l.t('pointsN', {'n': t})),
            selected: value == t,
            onSelected: onChanged == null ? null : (_) => onChanged!(t),
          ),
      ],
    );
  }
}

class DifficultyPicker extends StatelessWidget {
  const DifficultyPicker({super.key, required this.value, required this.onChanged});
  final Difficulty value;
  final ValueChanged<Difficulty> onChanged;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final d in Difficulty.values)
          ChoiceChip(
            label: Text(l.t('diff_${d.name}')),
            selected: value == d,
            onSelected: (_) => onChanged(d),
          ),
      ],
    );
  }
}

/// Settings shortcut showing the current tile style with a live preview.
class SkinShortcut extends StatelessWidget {
  const SkinShortcut({super.key});

  @override
  Widget build(BuildContext context) {
    final settings = SettingsScope.of(context);
    final l = context.l10n;
    return Card(
      child: ListTile(
        contentPadding: const EdgeInsetsDirectional.fromSTEB(16, 8, 12, 8),
        title: Text(l.t('tileStyle'), style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text(l.t('skin_${settings.skinId}')),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const DominoTile(first: 6, second: 3, length: 48),
            const SizedBox(width: 8),
            Icon(Directionality.of(context) == TextDirection.rtl ? Icons.chevron_left : Icons.chevron_right),
          ],
        ),
        onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const SkinPickerScreen())),
      ),
    );
  }
}
