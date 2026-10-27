import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';

class RulesScreen extends StatelessWidget {
  const RulesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l.t('rules'))),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Text(l.t('rulesBody'), style: Theme.of(context).textTheme.bodyLarge?.copyWith(height: 1.9)),
        ),
      ),
    );
  }
}
