import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'config/app_config.dart';
import 'network/api_client.dart';
import 'security/token_store.dart';

final siteConnectionProvider = StateProvider<SiteConnection?>(
  (ref) => AppConfig.connection,
);
final tokenStoreProvider = Provider<TokenStore>(
  (ref) => TokenStore(
    origin: ref.watch(siteConnectionProvider)?.origin ?? 'unconfigured',
  ),
);
final apiClientProvider = Provider<ApiClient>((ref) {
  final site = ref.watch(siteConnectionProvider);
  final client = ApiClient(
    ref.watch(tokenStoreProvider),
    baseUrl: site?.apiBaseUrl ?? '',
  );
  ref.onDispose(client.dispose);
  return client;
});
