import 'package:flutter_test/flutter_test.dart';
import 'package:daeef_jiddan/main.dart';

void main() {
  testWidgets('home screen renders', (tester) async {
    await tester.pumpWidget(const DominoApp());
    expect(find.text('ضعيف جدا'), findsOneWidget);
    expect(find.text('دومينو في الوقت الحقيقي'), findsOneWidget);
  });
}
