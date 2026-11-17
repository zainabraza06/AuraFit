import 'product.dart';

class AppUser {
  AppUser({required this.id, required this.name, required this.email, this.role = 'user', this.profilePicture});

  final String id;
  final String name;
  final String email;
  final String role;
  final String? profilePicture;

  factory AppUser.fromJson(Map<String, dynamic> j) => AppUser(
        id: '${j['_id'] ?? j['id'] ?? ''}',
        name: '${j['name'] ?? ''}',
        email: '${j['email'] ?? ''}',
        role: '${j['role'] ?? 'user'}',
        profilePicture: (j['profilePicture'] as String?)?.isEmpty == true ? null : j['profilePicture'] as String?,
      );
}

/// The stylist agent's answer: friendly text plus the products it chose (each with a short reason).
class StylistReply {
  StylistReply({required this.answer, required this.picks, this.toolCalls = 0, this.ms = 0, this.stopReason = 'answered'});

  final String answer;
  final List<Product> picks;
  final int toolCalls;
  final int ms;
  final String stopReason;

  factory StylistReply.fromJson(Map<String, dynamic> j) {
    final meta = (j['meta'] as Map?) ?? const {};
    return StylistReply(
      answer: '${j['answer'] ?? ''}',
      picks: [for (final p in (j['picks'] as List? ?? const [])) Product.fromJson(p as Map<String, dynamic>, why: (p as Map)['why'] as String?)],
      toolCalls: (meta['toolCalls'] as num?)?.toInt() ?? 0,
      ms: (meta['ms'] as num?)?.toInt() ?? 0,
      stopReason: '${meta['stopReason'] ?? 'answered'}',
    );
  }

  bool get usedFallback => stopReason != 'answered';
}

class PhotoSearchResult {
  PhotoSearchResult({required this.matches, required this.analysis, required this.detectedCatalog, required this.message, required this.visual});

  final List<Product> matches;
  final Map<String, dynamic> analysis;
  final String detectedCatalog;
  final String message;

  /// True when pixel-level (FashionCLIP) similarity contributed to the ranking.
  final bool visual;

  factory PhotoSearchResult.fromJson(Map<String, dynamic> j) => PhotoSearchResult(
        matches: [for (final p in (j['matches'] as List? ?? const [])) Product.fromJson(p as Map<String, dynamic>)],
        analysis: Map<String, dynamic>.from((j['analysis'] as Map?) ?? const {}),
        detectedCatalog: '${j['detectedCatalog'] ?? 'clothing'}',
        message: '${j['message'] ?? ''}',
        visual: j['visualSimilarity'] == true,
      );

  /// Short facts the vision model read from the photo, for display as chips.
  List<String> get tags {
    String? s(String k) {
      final v = analysis[k];
      if (v == null) return null;
      final t = '$v'.trim();
      return t.isEmpty || t == 'null' ? null : t;
    }

    return [for (final k in const ['category', 'color', 'style', 'occasion']) if (s(k) != null) s(k)!];
  }
}

class RecItem {
  RecItem(this.product, this.reason);

  final Product product;
  final String reason;
}

class Recommendations {
  Recommendations({required this.shoes, required this.complementary});

  final List<RecItem> shoes;
  final List<RecItem> complementary;

  factory Recommendations.fromJson(Map<String, dynamic> j) {
    List<RecItem> items(dynamic list) => [
          for (final e in (list as List? ?? const []))
            if (e is Map && e['product'] is Map)
              RecItem(Product.fromJson(Map<String, dynamic>.from(e['product'] as Map)), '${e['reason'] ?? ''}'),
        ];
    return Recommendations(shoes: items(j['shoes']), complementary: items(j['complementaryClothing']));
  }

  bool get isEmpty => shoes.isEmpty && complementary.isEmpty;
}

class TryOnJob {
  TryOnJob({required this.id, required this.status, this.resultUrl, this.error, this.reason, this.queuedAhead = 0, this.cached = false});

  final String id;
  final String status; // queued | running | done | failed
  final String? resultUrl;
  final String? error;
  final String? reason;
  final int queuedAhead;
  final bool cached;

  bool get isDone => status == 'done';
  bool get isFailed => status == 'failed';
  bool get isFinished => isDone || isFailed;

  factory TryOnJob.fromJson(Map<String, dynamic> j) => TryOnJob(
        id: '${j['id'] ?? ''}',
        status: '${j['status'] ?? 'queued'}',
        resultUrl: j['resultUrl'] as String?,
        error: j['error'] as String?,
        reason: j['reason'] as String?,
        queuedAhead: (j['queuedAhead'] as num?)?.toInt() ?? 0,
        cached: j['cached'] == true,
      );
}

class BrandCount {
  BrandCount(this.brand, this.count);

  final String brand;
  final int count;
}

class CatalogStats {
  CatalogStats({required this.total, required this.brands});

  final int total;
  final List<BrandCount> brands;

  factory CatalogStats.fromJson(Map<String, dynamic> j) => CatalogStats(
        total: (j['total'] as num?)?.toInt() ?? 0,
        brands: [
          for (final b in (j['topBrands'] as List? ?? const []))
            if (b is Map && b['_id'] != null) BrandCount('${b['_id']}', (b['count'] as num?)?.toInt() ?? 0),
        ],
      );
}

class ServerHealth {
  ServerHealth({required this.ok, required this.search, required this.visualSearch});

  final bool ok;

  /// "semantic" or "keyword": what the server's search is doing on its host.
  final String search;
  final bool visualSearch;

  factory ServerHealth.fromJson(Map<String, dynamic> j) =>
      ServerHealth(ok: j['status'] == 'ok', search: '${j['search'] ?? 'keyword'}', visualSearch: j['photoSearchVisual'] == true);
}
