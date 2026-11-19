import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/theme.dart';
import '../models/product.dart';
import '../services/aura_api.dart';
import '../services/state.dart';
import '../widgets/common.dart';
import 'photo_search_screen.dart';
import 'product_screen.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  static const _catalogs = <(String?, String)>[(null, 'Everything'), ('clothing', 'Clothing'), ('shoes', 'Shoes'), ('jewelry', 'Jewellery'), ('watches', 'Watches')];
  static const _ideas = ['black heels for a party', 'white kurta for eid', 'gold jhumka earrings', 'bridal red lehnga', 'pearl necklace set', 'kids watch'];

  final _controller = TextEditingController();
  final _scroll = ScrollController();
  Timer? _debounce;
  String? _catalog;
  String _query = '';
  final List<Product> _results = [];
  int _page = 0;
  bool _hasMore = false;
  bool _loading = false;
  String? _error;
  int _total = 0;
  int _generation = 0; // discards answers to searches that have been superseded

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 500) _fetch(more: true);
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _onChanged(String text) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 450), () => _start(text));
  }

  void _start(String text) {
    _query = text.trim();
    _generation++;
    _results.clear();
    _page = 0;
    _hasMore = false;
    _error = null;
    _total = 0;
    if (_query.length < 2) {
      setState(() => _loading = false);
      return;
    }
    _fetch();
  }

  Future<void> _fetch({bool more = false}) async {
    if (_loading || (more && !_hasMore) || _query.length < 2) return;
    final gen = _generation;
    setState(() => _loading = true);
    try {
      final page = await context.read<AuraApi>().search(_query, catalog: _catalog, page: _page + 1);
      if (!mounted || gen != _generation) return;
      setState(() {
        _page += 1;
        _results.addAll(page.products);
        _hasMore = page.pagination.hasMore;
        _total = page.pagination.total;
      });
    } on ApiException catch (e) {
      if (mounted && gen == _generation) setState(() => _error = e.message);
    } finally {
      if (mounted && gen == _generation) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final favorites = context.watch<FavoritesController>();
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
        child: Row(children: [
          Expanded(
            child: TextField(
              controller: _controller,
              onChanged: _onChanged,
              onSubmitted: _start,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: 'Search all catalogs',
                prefixIcon: const Icon(Icons.search, color: AuraColors.textMuted),
                suffixIcon: _controller.text.isEmpty
                    ? null
                    : IconButton(icon: const Icon(Icons.close, size: 18), onPressed: () {
                        _controller.clear();
                        _start('');
                      }),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Material(
            color: AuraColors.accent,
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PhotoSearchScreen())),
              child: const Padding(padding: EdgeInsets.all(13), child: Icon(Icons.photo_camera_outlined, color: Color(0xFF1A1408))),
            ),
          ),
        ]),
      ),
      SizedBox(
        height: 44,
        child: ListView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          children: [
            for (final (key, label) in _catalogs)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(label),
                  selected: _catalog == key,
                  onSelected: (_) {
                    setState(() => _catalog = key);
                    _start(_controller.text);
                  },
                ),
              ),
          ],
        ),
      ),
      Expanded(child: _body(favorites)),
    ]);
  }

  Widget _body(FavoritesController favorites) {
    if (_query.length < 2) {
      return ListView(padding: const EdgeInsets.all(20), children: [
        Text('Try asking for…', style: display(24)),
        const SizedBox(height: 12),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final idea in _ideas)
            ActionChip(
              label: Text(idea),
              onPressed: () {
                _controller.text = idea;
                _start(idea);
              },
            ),
        ]),
        const SizedBox(height: 22),
        const Text('Or tap the camera to search with a photo.', style: TextStyle(color: AuraColors.textMuted)),
      ]);
    }
    if (_results.isEmpty && _loading) return const LoadingView();
    if (_results.isEmpty && _error != null) return ErrorView(_error!, onRetry: () => _start(_query));
    if (_results.isEmpty) return EmptyView('Nothing found for "$_query"', subtitle: 'Try fewer words, or search by colour and garment: "red lehnga".');
    return ProductGrid(
      products: _results,
      controller: _scroll,
      favorites: (p) => favorites.isFavorite(p.id),
      onFavorite: (p) => toggleFavorite(context, p),
      onOpen: (p, i) => openProduct(context, p, query: _query, position: i),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      footer: _loading
          ? const Padding(padding: EdgeInsets.all(20), child: LoadingView())
          : Padding(padding: const EdgeInsets.all(16), child: Center(child: Text('$_total results', style: const TextStyle(color: AuraColors.textMuted, fontSize: 12)))),
    );
  }
}
