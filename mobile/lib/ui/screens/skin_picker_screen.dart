import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';
import '../../state/settings_controller.dart';
import '../widgets/domino_tile.dart';
import '../widgets/tile_skins.dart';

/// «شكل أحجار الدومينو»: preview every style and pick one.
class SkinPickerScreen extends StatelessWidget {
  const SkinPickerScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final settings = SettingsScope.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l.t('tileStyle'))),
      body: SafeArea(
        child: CustomScrollView(
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              sliver: SliverToBoxAdapter(
                child: Text(l.t('tileStyleHint'), style: Theme.of(context).textTheme.bodyMedium),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.all(16),
              sliver: SliverGrid(
                gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                  maxCrossAxisExtent: 220,
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 12,
                  childAspectRatio: 0.95,
                ),
                delegate: SliverChildBuilderDelegate(
                  (context, i) {
                    final skin = TileSkin.all[i];
                    return SkinCard(
                      skin: skin,
                      selected: settings.skinId == skin.id,
                      label: l.t('skin_${skin.id}'),
                      selectedLabel: l.t('selected'),
                      onTap: () => settings.setSkin(skin.id),
                    );
                  },
                  childCount: TileSkin.all.length,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class SkinCard extends StatelessWidget {
  const SkinCard({
    super.key,
    required this.skin,
    required this.selected,
    required this.label,
    required this.selectedLabel,
    required this.onTap,
  });

  final TileSkin skin;
  final bool selected;
  final String label;
  final String selectedLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      selected: selected,
      button: true,
      label: label,
      child: Material(
        color: selected ? scheme.primaryContainer : scheme.surfaceContainerHigh,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(color: selected ? scheme.primary : Colors.transparent, width: 2.5),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          key: ValueKey('skin-${skin.id}'),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              children: [
                Expanded(
                  child: FittedBox(
                    child: Directionality(
                      textDirection: TextDirection.ltr,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          DominoTile(first: 6, second: 6, length: 76, skin: skin),
                          const SizedBox(width: 8),
                          Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              DominoTile(first: 5, second: 2, axis: Axis.horizontal, length: 76, skin: skin),
                              const SizedBox(height: 8),
                              DominoTile(first: 1, second: 4, axis: Axis.horizontal, length: 76, skin: skin),
                            ],
                          ),
                          const SizedBox(width: 8),
                          DominoTile.back(length: 76, skin: skin),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (selected) ...[
                      Icon(Icons.check_circle, size: 20, color: scheme.primary, semanticLabel: selectedLabel),
                      const SizedBox(width: 6),
                    ],
                    Flexible(
                      child: Text(
                        label,
                        textAlign: TextAlign.center,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
