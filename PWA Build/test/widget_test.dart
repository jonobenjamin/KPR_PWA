import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:offline_mobile_app/wildlife_app.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory hiveDir;

  setUpAll(() async {
    hiveDir = await Directory.systemTemp.createTemp('moremi_hive_test');
    Hive.init(hiveDir.path);
    await Hive.openBox('offlineData');
    await Hive.openBox('userData');
  });

  tearDownAll(() async {
    await Hive.close();
    if (hiveDir.existsSync()) {
      hiveDir.deleteSync(recursive: true);
    }
  });

  testWidgets('Wildlife app builds', (WidgetTester tester) async {
    await tester.pumpWidget(
      const WildlifeAppRoot(
        home: Scaffold(body: Center(child: Text('smoke'))),
      ),
    );
    await tester.pump();
    expect(find.text('smoke'), findsOneWidget);
  });
}
