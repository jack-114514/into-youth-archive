import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/config/app_config.dart';
import 'core/config/site_store.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    AppConfig.connection = await const SiteStore().read();
  } catch (_) {
    AppConfig.connection = null;
  }
  runApp(const ProviderScope(child: IntoYouthAdminApp()));
}
