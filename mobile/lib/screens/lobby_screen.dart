import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import 'table_screen.dart';

class LobbyScreen extends StatefulWidget {
  const LobbyScreen({super.key});
  @override
  State<LobbyScreen> createState() => _LobbyScreenState();
}

class _LobbyScreenState extends State<LobbyScreen> {
  final List<String> players = ['أنت', 'Bot 1'];
  String difficulty = 'عادي';

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(title: const Text('غرفة خاصة')),
        body: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Card(
                child: ListTile(
                  title: const Text('رمز الغرفة', style: TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: const Text('ABCD', style: TextStyle(fontSize: 28, letterSpacing: 6)),
                  trailing: IconButton(
                    icon: const Icon(Icons.share),
                    onPressed: () => Share.share('انضم إلى غرفة ضعيف جدا: ABCD'),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              const Text('اللاعبون', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              ...players.asMap().entries.map((entry) {
                final index = entry.key;
                final player = entry.value;
                return Card(
                  child: ListTile(
                    leading: CircleAvatar(child: Text(player.characters.first)),
                    title: Text(player),
                    trailing: player == 'أنت'
                        ? const Text('المضيف')
                        : IconButton(
                            icon: const Icon(Icons.close),
                            onPressed: () => setState(() => players.removeAt(index)),
                          ),
                  ),
                );
              }),
              OutlinedButton.icon(
                onPressed: players.length < 4
                    ? () => setState(() => players.add('Bot ' + players.length.toString()))
                    : null,
                icon: const Icon(Icons.add),
                label: const Text('إضافة بوت'),
              ),
              DropdownButtonFormField<String>(
                initialValue: difficulty,
                items: const ['سهل', 'عادي', 'صعب', 'خبير']
                    .map((x) => DropdownMenuItem(value: x, child: Text('صعوبة البوت: ' + x)))
                    .toList(),
                onChanged: (value) {
                  if (value != null) setState(() => difficulty = value);
                },
              ),
              const Spacer(),
              FilledButton(
                onPressed: () => Navigator.push(
                  context, MaterialPageRoute(builder: (_) => const TableScreen()),
                ),
                child: const Padding(
                  padding: EdgeInsets.all(14),
                  child: Text('ابدأ اللعبة'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
