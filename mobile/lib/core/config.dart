import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Where the API lives.
///
/// Order of precedence: a URL the user saved in the app (Account → Server) > `--dart-define=API_BASE_URL=...`
/// > a sensible default for the platform (the Android emulator reaches the host machine at 10.0.2.2).
class AppConfig extends ChangeNotifier {
  AppConfig(this._prefs);

  static const _key = 'api_base_url';
  static const _fromEnv = String.fromEnvironment('API_BASE_URL');

  final SharedPreferences _prefs;

  static String get platformDefault {
    if (_fromEnv.isNotEmpty) return _fromEnv;
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) return 'http://10.0.2.2:5000/api';
    return 'http://localhost:5000/api';
  }

  String get baseUrl => _normalize(_prefs.getString(_key) ?? platformDefault);

  bool get isCustom => _prefs.getString(_key) != null;

  Future<void> setBaseUrl(String? url) async {
    if (url == null || url.trim().isEmpty) {
      await _prefs.remove(_key);
    } else {
      await _prefs.setString(_key, _normalize(url));
    }
    notifyListeners();
  }

  /// Trims whitespace and trailing slashes, and adds `/api` when the user typed just the host.
  static String normalizeForTest(String url) => _normalize(url);

  static String _normalize(String url) {
    var u = url.trim();
    while (u.endsWith('/')) {
      u = u.substring(0, u.length - 1);
    }
    if (!u.endsWith('/api')) u = '$u/api';
    return u;
  }
}
