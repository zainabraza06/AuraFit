import 'package:intl/intl.dart';

/// One product from any of the four catalogs. Parsing is deliberately tolerant: the API serves four different
/// schemas (clothing, shoes, jewellery, watches) and scraped data is messy.
class Product {
  Product({
    required this.id,
    required this.name,
    required this.brand,
    required this.price,
    this.currency = 'PKR',
    this.imageUrl,
    this.images = const [],
    this.description = '',
    this.primaryColor,
    this.occasion = const [],
    this.sizes = const [],
    this.productUrl,
    this.catalog = 'clothing',
    this.inStock = true,
    this.why,
    this.type,
  });

  final String id;
  final String name;
  final String brand;
  final num price;
  final String currency;
  final String? imageUrl;
  final List<String> images;
  final String description;
  final String? primaryColor;
  final List<String> occasion;
  final List<String> sizes;
  final String? productUrl;

  /// clothing | shoes | jewelry | watches
  final String catalog;
  final bool inStock;

  /// Why the agent / recommender picked it (only set for picks).
  final String? why;

  /// dressStyle / shoeType / jewelryType / watchType, whichever applies.
  final String? type;

  static List<String> _strings(dynamic v) => v is List ? v.map((e) => '$e').where((e) => e.isNotEmpty).toList() : const [];

  factory Product.fromJson(Map<String, dynamic> j, {String? why}) {
    final images = _strings(j['images']);
    // the stylist agent's compact products say `image` and `url`; catalog products say `imageUrl` and `productUrl`
    final main = ((j['imageUrl'] ?? j['image']) as String?)?.trim();
    final cat = (j['catalog'] ?? j['category'] ?? 'clothing').toString().toLowerCase();
    return Product(
      id: '${j['_id'] ?? j['id'] ?? ''}',
      name: '${j['name'] ?? 'Untitled'}',
      brand: '${j['brand'] ?? ''}',
      price: j['price'] is num ? j['price'] as num : num.tryParse('${j['price']}') ?? 0,
      currency: '${j['currency'] ?? 'PKR'}',
      imageUrl: (main != null && main.isNotEmpty) ? main : (images.isNotEmpty ? images.first : null),
      images: images,
      description: '${j['description'] ?? ''}'.trim(),
      primaryColor: (j['primaryExactColor'] ?? j['primaryColor']) as String?,
      occasion: _strings(j['occasion']),
      sizes: _strings(j['sizes']),
      productUrl: (j['productUrl'] ?? j['url']) as String?,
      catalog: const {'clothing', 'shoes', 'jewelry', 'watches'}.contains(cat) ? cat : _catalogFromCategory(cat),
      inStock: j['inStock'] != false,
      why: why ?? (j['why'] as String?),
      type: (j['dressStyle'] ?? j['shoeType'] ?? j['jewelryType'] ?? j['watchType'] ?? j['type']) as String?,
    );
  }

  static String _catalogFromCategory(String c) {
    if (c.contains('shoe') || c.contains('foot')) return 'shoes';
    if (c.contains('jewel')) return 'jewelry';
    if (c.contains('watch')) return 'watches';
    return 'clothing';
  }

  /// "PKR 5,000". Whole rupees: fractions are noise for clothing prices.
  String get displayPrice => '$currency ${NumberFormat.decimalPattern().format(price.round())}';

  /// Images to show in the gallery: the main one first, then the rest, without duplicates.
  List<String> get gallery {
    final all = <String>[?imageUrl, ...images];
    return all.toSet().toList();
  }

  bool get canTryOn => catalog == 'clothing';
}

class Pagination {
  Pagination({required this.page, required this.total, required this.hasMore});

  final int page;
  final int total;
  final bool hasMore;

  factory Pagination.fromJson(Map<String, dynamic>? j) => Pagination(
        page: (j?['page'] as num?)?.toInt() ?? 1,
        total: (j?['total'] as num?)?.toInt() ?? 0,
        hasMore: j?['hasMore'] == true,
      );
}

class ProductPage {
  ProductPage(this.products, this.pagination);

  final List<Product> products;
  final Pagination pagination;

  factory ProductPage.fromJson(Map<String, dynamic> j) => ProductPage(
        [for (final p in (j['products'] as List? ?? const [])) Product.fromJson(p as Map<String, dynamic>)],
        Pagination.fromJson(j['pagination'] as Map<String, dynamic>?),
      );
}
