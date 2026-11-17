import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../app.dart';
import '../core/api_client.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../models/product.dart';
import '../services/aura_api.dart';
import '../services/state.dart';
import '../widgets/common.dart';
import 'tryon_screen.dart';

/// Opens a product page and records the click as feedback (a fire-and-forget analytics event).
void openProduct(BuildContext context, Product p, {String surface = 'search', int? position, String? query}) {
  context.read<AuraApi>().feedback('result_click', productUrl: p.productUrl, catalog: p.catalog, query: query, position: position, surface: surface);
  Navigator.of(context).push(MaterialPageRoute(builder: (_) => ProductScreen(product: p)));
}

/// Heart tap handler shared by every grid. Signed-out users are offered sign-in instead of failing silently.
Future<void> toggleFavorite(BuildContext context, Product p) async {
  final favorites = context.read<FavoritesController>();
  try {
    final now = await favorites.toggle(p);
    if (!context.mounted) return;
    if (now == null) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(
          content: const Text('Sign in to save favourites'),
          action: SnackBarAction(label: 'Sign in', textColor: AuraColors.accent, onPressed: () => Shell.goTo(context, Shell.tabAccount)),
        ));
    } else {
      showMessage(context, now ? 'Saved to favourites' : 'Removed from favourites');
    }
  } on ApiException catch (e) {
    if (context.mounted) showMessage(context, e.message);
  }
}

class ProductScreen extends StatefulWidget {
  const ProductScreen({super.key, required this.product});

  final Product product;

  @override
  State<ProductScreen> createState() => _ProductScreenState();
}

class _ProductScreenState extends State<ProductScreen> {
  late Product _product = widget.product;
  Recommendations? _recs;
  bool _recsLoading = false;
  String? _recsError;
  bool _expanded = false;
  int _imageIndex = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final api = context.read<AuraApi>();
    // the list view may carry a trimmed record: fetch the full one (description, sizes, every image)
    api.product(_product.id).then((p) {
      if (mounted) setState(() => _product = p);
    }).catchError((_) {});
    if (_product.catalog != 'clothing') return; // "complete the look" is built around a clothing item
    setState(() => _recsLoading = true);
    try {
      final r = await api.recommendations(_product.id);
      if (mounted) setState(() => _recs = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _recsError = e.message);
    } finally {
      if (mounted) setState(() => _recsLoading = false);
    }
  }

  Future<void> _openRetailer() async {
    final url = _product.productUrl;
    if (url == null) return;
    final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    if (!ok && mounted) showMessage(context, 'Could not open the retailer page');
  }

  @override
  Widget build(BuildContext context) {
    final p = _product;
    final gallery = p.gallery;
    final favorites = context.watch<FavoritesController>();
    return Scaffold(
      appBar: AppBar(
        actions: [
          IconButton(
            tooltip: 'Save',
            icon: Icon(favorites.isFavorite(p.id) ? Icons.favorite : Icons.favorite_border, color: favorites.isFavorite(p.id) ? AuraColors.accent : null),
            onPressed: () => toggleFavorite(context, p),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 110),
        children: [
          AspectRatio(
            aspectRatio: 0.82,
            child: Stack(children: [
              PageView.builder(
                itemCount: gallery.isEmpty ? 1 : gallery.length,
                onPageChanged: (i) => setState(() => _imageIndex = i),
                itemBuilder: (_, i) => ProductImage(gallery.isEmpty ? null : gallery[i]),
              ),
              if (gallery.length > 1)
                Positioned(
                  bottom: 12,
                  left: 0,
                  right: 0,
                  child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                    for (var i = 0; i < gallery.length && i < 8; i++)
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        margin: const EdgeInsets.symmetric(horizontal: 3),
                        width: i == _imageIndex ? 18 : 6,
                        height: 6,
                        decoration: BoxDecoration(color: i == _imageIndex ? AuraColors.accent : Colors.white54, borderRadius: BorderRadius.circular(3)),
                      ),
                  ]),
                ),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(p.brand.toUpperCase(), style: const TextStyle(fontSize: 11.5, letterSpacing: 1.6, color: AuraColors.accent)),
              const SizedBox(height: 6),
              Text(p.name, style: display(30)),
              const SizedBox(height: 10),
              Text(p.displayPrice, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: AuraColors.accent)),
              const SizedBox(height: 14),
              Wrap(spacing: 8, runSpacing: 8, children: [
                if (p.primaryColor != null) Chip(label: Text(p.primaryColor!)),
                for (final o in p.occasion.take(3)) Chip(label: Text(o)),
                if (!p.inStock) const Chip(label: Text('Sold out')),
              ]),
              if (p.sizes.isNotEmpty) ...[
                const SizedBox(height: 16),
                const Text('Sizes', style: TextStyle(color: AuraColors.textDim, fontSize: 12.5)),
                const SizedBox(height: 6),
                Wrap(spacing: 8, runSpacing: 8, children: [for (final s in p.sizes) Chip(label: Text(s))]),
              ],
              if (p.description.isNotEmpty) ...[
                const SizedBox(height: 18),
                Text(p.description, maxLines: _expanded ? null : 5, overflow: _expanded ? null : TextOverflow.ellipsis, style: const TextStyle(color: AuraColors.textDim, height: 1.55, fontSize: 14)),
                if (p.description.length > 220)
                  TextButton(onPressed: () => setState(() => _expanded = !_expanded), child: Text(_expanded ? 'Show less' : 'Read more')),
              ],
            ]),
          ),
          if (p.catalog == 'clothing') _completeTheLook(),
        ],
      ),
      bottomSheet: Container(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        decoration: const BoxDecoration(color: AuraColors.surface, border: Border(top: BorderSide(color: AuraColors.border))),
        child: SafeArea(
          top: false,
          child: Row(children: [
            if (p.canTryOn) ...[
              Expanded(
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.checkroom_outlined, size: 18),
                  label: const Text('Try on'),
                  onPressed: () {
                    context.read<AuraApi>().feedback('tryon_start', productUrl: p.productUrl, catalog: p.catalog, surface: 'tryon');
                    Navigator.of(context).push(MaterialPageRoute(builder: (_) => TryOnScreen(product: p)));
                  },
                ),
              ),
              const SizedBox(width: 12),
            ],
            Expanded(
              flex: 2,
              child: FilledButton.icon(icon: const Icon(Icons.open_in_new, size: 18), label: Text('View on ${p.brand.isEmpty ? 'retailer' : p.brand}'), onPressed: p.productUrl == null ? null : _openRetailer),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _completeTheLook() {
    if (_recsLoading) return const Padding(padding: EdgeInsets.all(32), child: LoadingView());
    if (_recsError != null || _recs == null || _recs!.isEmpty) return const SizedBox.shrink();
    Widget row(String title, List<RecItem> items) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SectionTitle(title),
          SizedBox(
            height: 318,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: items.length,
              separatorBuilder: (_, _) => const SizedBox(width: 14),
              itemBuilder: (_, i) => SizedBox(
                width: 150,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Expanded(child: ProductCard(product: items[i].product, onTap: () => openProduct(context, items[i].product, surface: 'outfit', position: i))),
                  const SizedBox(height: 6),
                  Text(items[i].reason, maxLines: 3, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, color: AuraColors.textMuted, height: 1.35)),
                ]),
              ),
            ),
          ),
        ]);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      if (_recs!.shoes.isNotEmpty) row('Shoes to match', _recs!.shoes.take(6).toList()),
      if (_recs!.complementary.isNotEmpty) row('Pairs well with', _recs!.complementary.take(6).toList()),
    ]);
  }
}
