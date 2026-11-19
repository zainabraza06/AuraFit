import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/api_client.dart';
import '../models/models.dart';
import '../models/product.dart';
import 'aura_api.dart';

/// Who is signed in. The token lives in SharedPreferences and is attached to every request by [ApiClient].
class AuthController extends ChangeNotifier {
  AuthController(this._prefs);

  static const _tokenKey = 'token';
  final SharedPreferences _prefs;
  late AuraApi _api;
  AppUser? _user;
  bool _busy = false;

  void attach(AuraApi api) => _api = api;

  String? get token => _prefs.getString(_tokenKey);
  AppUser? get user => _user;
  bool get signedIn => _user != null;
  bool get busy => _busy;

  /// Called on startup: if we have a saved token, find out whether it is still good.
  Future<void> restore() async {
    if (token == null) return;
    try {
      _user = await _api.me();
    } on ApiException catch (e) {
      if (e.isUnauthorized) await _prefs.remove(_tokenKey); // expired or revoked
    } catch (_) {
      // offline: keep the token, try again next launch
    }
    notifyListeners();
  }

  Future<void> login(String email, String password) => _authenticate(() => _api.login(email.trim(), password));

  Future<void> register(String name, String email, String password) => _authenticate(() => _api.register(name.trim(), email.trim(), password));

  Future<void> _authenticate(Future<(AppUser, String)> Function() call) async {
    _busy = true;
    notifyListeners();
    try {
      final (user, token) = await call();
      await _prefs.setString(_tokenKey, token);
      _user = user;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  Future<void> logout() async {
    await _prefs.remove(_tokenKey);
    _user = null;
    notifyListeners();
  }
}

/// The signed-in user's favourites. Empty and inert when signed out.
class FavoritesController extends ChangeNotifier {
  FavoritesController(this._auth);

  final AuthController _auth;
  late AuraApi _api;
  List<Product> _items = [];
  bool _loading = false;
  String? _error;

  void attach(AuraApi api) => _api = api;

  List<Product> get items => _items;
  bool get loading => _loading;
  String? get error => _error;
  bool isFavorite(String id) => _items.any((p) => p.id == id);

  Future<void> load() async {
    if (!_auth.signedIn) {
      _items = [];
      notifyListeners();
      return;
    }
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      _items = await _api.favorites();
    } on ApiException catch (e) {
      _error = e.message;
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  /// Returns the new state, or null when signed out (the caller should offer sign-in).
  Future<bool?> toggle(Product p) async {
    if (!_auth.signedIn) return null;
    final now = await _api.toggleFavorite(p.id);
    if (now) {
      if (!isFavorite(p.id)) _items = [p, ..._items];
      _api.feedback('save', productUrl: p.productUrl, catalog: p.catalog, surface: 'product');
    } else {
      _items = _items.where((x) => x.id != p.id).toList();
      _api.feedback('unsave', productUrl: p.productUrl, catalog: p.catalog, surface: 'product');
    }
    notifyListeners();
    return now;
  }

  void clear() {
    _items = [];
    notifyListeners();
  }
}
