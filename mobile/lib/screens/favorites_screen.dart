import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../app.dart';
import '../core/theme.dart';
import '../services/state.dart';
import '../widgets/common.dart';
import 'product_screen.dart';

class FavoritesScreen extends StatelessWidget {
  const FavoritesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final favorites = context.watch<FavoritesController>();

    Widget body;
    if (!auth.signedIn) {
      body = Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.favorite_border, size: 42, color: AuraColors.textMuted),
            const SizedBox(height: 14),
            Text('Save what you love', style: display(26)),
            const SizedBox(height: 8),
            const Text('Sign in to keep a list of favourites that follows you across devices.', textAlign: TextAlign.center, style: TextStyle(color: AuraColors.textDim, height: 1.45)),
            const SizedBox(height: 20),
            FilledButton(onPressed: () => Shell.goTo(context, Shell.tabAccount), child: const Text('Sign in')),
          ]),
        ),
      );
    } else if (favorites.loading && favorites.items.isEmpty) {
      body = const LoadingView();
    } else if (favorites.error != null && favorites.items.isEmpty) {
      body = ErrorView(favorites.error!, onRetry: favorites.load);
    } else if (favorites.items.isEmpty) {
      body = const EmptyView('No favourites yet', subtitle: 'Tap the heart on any product to save it here.', icon: Icons.favorite_border);
    } else {
      body = RefreshIndicator(
        color: AuraColors.accent,
        backgroundColor: AuraColors.card,
        onRefresh: favorites.load,
        child: ProductGrid(
          products: favorites.items,
          favorites: (_) => true,
          onFavorite: (p) => toggleFavorite(context, p),
          onOpen: (p, i) => openProduct(context, p, surface: 'product', position: i),
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
        ),
      );
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(padding: const EdgeInsets.fromLTRB(20, 18, 20, 12), child: Text('Saved', style: display(34))),
      Expanded(child: body),
    ]);
  }
}
