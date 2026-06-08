bool navigatorOnLine() => true;

String? localStorageGet(String key) => null;

void localStorageSet(String key, String value) {}

void localStorageRemove(String key) {}

/// Clears path-scoped auth keys (web: same set as docs/moremi-storage.js LEGACY_KEYS).
void localStorageClearMoremiAuthKeys() {}

void listenOnline(void Function() onOnline) {}

void listenOffline(void Function() onOffline) {}

void signOutMoremi() {}

String? peekJoinGroupQueryParam() => null;

void triggerForceAppUpdate() {}

/// Absolute URL for [moremi_build.json] (web only).
String? moremiBuildJsonUrl() => null;

void stripJoinGroupQueryParam() {}

/// JS shell (`window.moremiGetFreshIdToken`) → fresh Firebase ID token for REST / flutter-session.
Future<String?> moremiFreshIdTokenFromJsShell() async => null;
