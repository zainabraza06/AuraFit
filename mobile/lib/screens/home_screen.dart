import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../app.dart';
import '../core/api_client.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../models/product.dart';
import '../services/aura_api.dart';
import '../services/state.dart';
import '../widgets/common.dart';
import 'product_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _scroll = ScrollController();
  List<Product> _featured = [];
  CatalogStats? _stats;
  final List<Product> _items = [];
  String? _brand;
  int _page = 0;
  bool _hasMore = true;
  bool _loading = false;
  String? _error;

  AuraApi get _api => context.read<AuraApi>();

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 600) _loadMore();
    });
    WidgetsBinding.instance.addPostFrameCallback((_) => _refresh());
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    setState(() {
      _items.clear();
      _page = 0;
      _hasMore = true;
      _error = null;
    });
    // featured + stats are decoration: a failure there must not hide the product list
    _api.featured().then((v) => mounted ? setState(() => _featured = v) : null).catchError((_) {});
    _api.stats().then((v) => mounted ? setState(() => _stats = v) : null).catchError((_) {});
    await _loadMore();
  }

  Future<void> _loadMore() async {
    if (_loading || !_hasMore) return;
    setState(() => _loading = true);
    try {
      final page = await _api.products(page: _page + 1, brand: _brand);
      if (!mounted) return;
      setState(() {
        _page += 1;
        _items.addAll(page.products);
        _hasMore = page.pagination.hasMore;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _pickBrand(String? brand) {
    if (_brand == brand) return;
    _brand = brand;
    _refresh();
  }

  @override
  Widget build(BuildContext context) {
    final favorites = context.watch<FavoritesController>();
    return RefreshIndicator(
      color: AuraColors.accent,
      backgroundColor: AuraColors.card,
      onRefresh: _refresh,
      child: CustomScrollView(
        controller: _scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(child: _Header(total: _stats?.total)),
          if (_stats != null && _stats!.brands.isNotEmpty)
            SliverToBoxAdapter(
              child: SizedBox(
                height: 44,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  children: [
                    Padding(padding: const EdgeInsets.only(right: 8), child: ChoiceChip(label: const Text('All'), selected: _brand == null, onSelected: (_) => _pickBrand(null))),
                    for (final b in _stats!.brands)
                      Padding(padding: const EdgeInsets.only(right: 8), child: ChoiceChip(label: Text(b.brand), selected: _brand == b.brand, onSelected: (_) => _pickBrand(b.brand))),
                  ],
                ),
              ),
            ),
          if (_featured.isNotEmpty && _brand == null) ...[
            const SliverToBoxAdapter(child: SectionTitle('Featured')),
            SliverToBoxAdapter(
              child: SizedBox(
                height: 262,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: _featured.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 14),
                  itemBuilder: (_, i) => ProductCard(
                    product: _featured[i],
                    width: 150,
                    onTap: () => openProduct(context, _featured[i], surface: 'product', position: i),
                  ),
                ),
              ),
            ),
          ],
          SliverToBoxAdapter(child: SectionTitle(_brand ?? 'New arrivals')),
          if (_items.isEmpty && _error != null)
            SliverFillRemaining(hasScrollBody: false, child: ErrorView(_error!, onRetry: _refresh))
          else if (_items.isEmpty && _loading)
            const SliverFillRemaining(hasScrollBody: false, child: LoadingView())
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              sliver: SliverGrid.builder(
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 18, crossAxisSpacing: 14, childAspectRatio: 0.58),
                itemCount: _items.length,
                itemBuilder: (_, i) => ProductCard(
                  product: _items[i],
                  favorite: favorites.isFavorite(_items[i].id),
                  onFavorite: () => toggleFavorite(context, _items[i]),
                  onTap: () => openProduct(context, _items[i], surface: 'product', position: i),
                ),
              ),
            ),
          if (_loading && _items.isNotEmpty)
            const SliverToBoxAdapter(child: Padding(padding: EdgeInsets.all(20), child: LoadingView())),
          if (!_hasMore && _items.isNotEmpty)
            const SliverToBoxAdapter(child: Padding(padding: EdgeInsets.all(24), child: Center(child: Text("You've seen everything.", style: TextStyle(color: AuraColors.textMuted))))),
          const SliverToBoxAdapter(child: SizedBox(height: 16)),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({this.total});

  final int? total;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Flexible(child: Text('AuraFit', maxLines: 1, overflow: TextOverflow.ellipsis, style: display(38))),
          const SizedBox(width: 8),
          const Icon(Icons.auto_awesome, size: 18, color: AuraColors.accent),
        ]),
        const SizedBox(height: 4),
        Text(total == null ? 'Pakistani fashion, styled by AI' : '$total pieces from Pakistani brands, styled by AI', style: const TextStyle(color: AuraColors.textDim, fontSize: 13.5)),
        const SizedBox(height: 16),
        GestureDetector(
          onTap: () => Shell.goTo(context, Shell.tabSearch),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(color: AuraColors.card, borderRadius: BorderRadius.circular(12), border: Border.all(color: AuraColors.border)),
            child: const Row(children: [
              Icon(Icons.search, color: AuraColors.textMuted, size: 20),
              SizedBox(width: 10),
              Expanded(child: Text('Search "black heels for a party"', style: TextStyle(color: AuraColors.textMuted))),
            ]),
          ),
        ),
      ]),
    );
  }
}
