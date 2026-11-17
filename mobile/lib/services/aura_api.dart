import 'dart:math';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import '../core/api_client.dart';
import '../models/models.dart';
import '../models/product.dart';

/// Every endpoint the app uses, typed. Screens never build URLs or parse raw JSON.
class AuraApi {
  AuraApi(this.client, {required this.sessionId});

  final ApiClient client;

  /// Anonymous, random, stored on the device. Lets feedback events be grouped without knowing who you are.
  final String sessionId;

  Future<ServerHealth> health() async => ServerHealth.fromJson(Map<String, dynamic>.from(await client.get('/health', timeout: const Duration(seconds: 10))));

  // ── catalog
  Future<List<Product>> featured() async {
    final j = await client.get('/products/featured') as Map;
    return [for (final p in (j['featured'] as List? ?? const [])) Product.fromJson(Map<String, dynamic>.from(p as Map))];
  }

  Future<CatalogStats> stats() async => CatalogStats.fromJson(Map<String, dynamic>.from(await client.get('/products/stats')));

  Future<ProductPage> products({int page = 1, int limit = 20, String? brand}) async =>
      ProductPage.fromJson(Map<String, dynamic>.from(await client.get('/products', query: {'page': page, 'limit': limit, 'brand': brand})));

  Future<Product> product(String id) async {
    final j = await client.get('/products/$id') as Map;
    return Product.fromJson(Map<String, dynamic>.from(j['product'] as Map));
  }

  Future<ProductPage> search(String q, {String? catalog, int page = 1, int limit = 20}) async =>
      ProductPage.fromJson(Map<String, dynamic>.from(await client.get('/search', query: {'q': q, 'catalog': catalog, 'page': page, 'limit': limit})));

  Future<Recommendations> recommendations(String id) async =>
      Recommendations.fromJson(Map<String, dynamic>.from(await client.get('/recommendations/$id', timeout: const Duration(seconds: 60))));

  // ── AI
  Future<StylistReply> askStylist(String message) async =>
      StylistReply.fromJson(Map<String, dynamic>.from(await client.post('/stylist/ask', body: {'message': message}, timeout: const Duration(seconds: 120))));

  Future<PhotoSearchResult> photoSearch(Uint8List bytes, String filename) async {
    final res = await client.postMultipart('/search/visual/image', files: [_imagePart('image', bytes, filename)]);
    return PhotoSearchResult.fromJson(Map<String, dynamic>.from(res as Map));
  }

  /// Starts a try-on job: your photo + the product's image URL. Returns immediately; poll [tryOnJob].
  Future<TryOnJob> startTryOn(Uint8List personPhoto, String filename, String clothingUrl) async {
    final res = await client.postMultipart(
      '/tryon/jobs',
      fields: {'clothingUrl': clothingUrl},
      files: [_imagePart('person', personPhoto, filename)],
    );
    return TryOnJob.fromJson(Map<String, dynamic>.from(res as Map));
  }

  Future<TryOnJob> tryOnJob(String id) async => TryOnJob.fromJson(Map<String, dynamic>.from(await client.get('/tryon/jobs/$id')));

  // ── account
  Future<(AppUser, String)> login(String email, String password) async {
    final j = Map<String, dynamic>.from(await client.post('/auth/login', body: {'email': email, 'password': password}) as Map);
    return (AppUser.fromJson(Map<String, dynamic>.from(j['user'] as Map)), '${j['token']}');
  }

  Future<(AppUser, String)> register(String name, String email, String password) async {
    final j = Map<String, dynamic>.from(await client.post('/auth/register', body: {'name': name, 'email': email, 'password': password}) as Map);
    return (AppUser.fromJson(Map<String, dynamic>.from(j['user'] as Map)), '${j['token']}');
  }

  Future<AppUser> me() async {
    final j = await client.get('/auth/me') as Map;
    return AppUser.fromJson(Map<String, dynamic>.from(j['user'] as Map));
  }

  Future<List<Product>> favorites() async {
    final j = await client.get('/favorites') as Map;
    return [for (final p in (j['favorites'] as List? ?? const [])) Product.fromJson(Map<String, dynamic>.from(p as Map))];
  }

  /// Toggles and returns the new state (true = now a favourite).
  Future<bool> toggleFavorite(String productId) async {
    final j = await client.post('/favorites/$productId') as Map;
    return j['favorited'] == true;
  }

  // ── feedback (analytics; must never break the UI)
  Future<void> feedback(String action, {String? productUrl, String? catalog, String? query, int? position, String surface = 'search'}) async {
    try {
      await client.post('/feedback', timeout: const Duration(seconds: 8), body: {
        'action': action,
        'clientEventId': _eventId(),
        'surface': surface,
        'sessionId': sessionId,
        if (productUrl != null && productUrl.startsWith('http')) 'productUrl': productUrl,
        'catalog': ?catalog,
        if (query != null && query.isNotEmpty) 'query': query.length > 200 ? query.substring(0, 200) : query,
        if (position != null) 'position': position.clamp(0, 200),
      });
    } catch (_) {
      // analytics only
    }
  }

  static final _rng = Random();
  static String _eventId() => '${DateTime.now().microsecondsSinceEpoch.toRadixString(36)}-${_rng.nextInt(1 << 32).toRadixString(36)}';

  static http.MultipartFile _imagePart(String field, Uint8List bytes, String filename) {
    final lower = filename.toLowerCase();
    final type = lower.endsWith('.png')
        ? MediaType('image', 'png')
        : lower.endsWith('.webp')
            ? MediaType('image', 'webp')
            : lower.endsWith('.gif')
                ? MediaType('image', 'gif')
                : MediaType('image', 'jpeg');
    return http.MultipartFile.fromBytes(field, bytes, filename: filename.isEmpty ? 'photo.jpg' : filename, contentType: type);
  }

  /// Exposed for tests.
  static String contentTypeFor(String filename) => _imagePart('x', Uint8List(0), filename).contentType.mimeType;

  /// A fresh random id for [sessionId].
  static String newSessionId() => 'm-${DateTime.now().millisecondsSinceEpoch.toRadixString(36)}-${_rng.nextInt(1 << 32).toRadixString(36)}';
}
