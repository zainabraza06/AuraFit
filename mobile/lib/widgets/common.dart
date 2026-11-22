import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../core/theme.dart';
import '../models/product.dart';

class ProductImage extends StatelessWidget {
  const ProductImage(this.url, {super.key, this.fit = BoxFit.cover});

  final String? url;
  final BoxFit fit;

  /// Tests replace the network image with a plain widget (the image cache needs platform plugins).
  static Widget Function(String url, BoxFit fit)? debugBuilder;

  @override
  Widget build(BuildContext context) {
    if (url == null) return const _Placeholder();
    if (debugBuilder != null) return debugBuilder!(url!, fit);
    return CachedNetworkImage(
      imageUrl: url!,
      fit: fit,
      fadeInDuration: const Duration(milliseconds: 180),
      placeholder: (_, _) => const ColoredBox(color: AuraColors.card),
      errorWidget: (_, _, _) => const _Placeholder(),
    );
  }
}

class _Placeholder extends StatelessWidget {
  const _Placeholder();

  @override
  Widget build(BuildContext context) => const ColoredBox(
        color: AuraColors.card,
        child: Center(child: Icon(Icons.checkroom_outlined, color: AuraColors.textMuted, size: 34)),
      );
}

/// A product tile: image, brand, name, price. Heart overlay when [favorite] is non-null.
class ProductCard extends StatelessWidget {
  const ProductCard({super.key, required this.product, required this.onTap, this.favorite, this.onFavorite, this.width});

  final Product product;
  final VoidCallback onTap;
  final bool? favorite;
  final VoidCallback? onFavorite;
  final double? width;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: width,
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    ProductImage(product.imageUrl),
                    if (favorite != null)
                      Positioned(
                        top: 6,
                        right: 6,
                        child: Material(
                          color: Colors.black45,
                          shape: const CircleBorder(),
                          child: InkWell(
                            customBorder: const CircleBorder(),
                            onTap: onFavorite,
                            child: Padding(
                              padding: const EdgeInsets.all(7),
                              child: Icon(favorite! ? Icons.favorite : Icons.favorite_border, size: 18, color: favorite! ? AuraColors.accent : Colors.white),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            Text(product.brand.toUpperCase(), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 10.5, letterSpacing: 1.2, color: AuraColors.textMuted)),
            const SizedBox(height: 2),
            Text(product.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, height: 1.25)),
            const SizedBox(height: 3),
            Text(product.displayPrice, style: const TextStyle(fontSize: 13, color: AuraColors.accent, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key, this.trailing});

  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 12),
        child: Row(children: [Expanded(child: Text(text, style: display(26))), ?trailing]),
      );
}

class ErrorView extends StatelessWidget {
  const ErrorView(this.message, {super.key, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.cloud_off_outlined, size: 40, color: AuraColors.textMuted),
            const SizedBox(height: 14),
            Text(message, textAlign: TextAlign.center, style: const TextStyle(color: AuraColors.textDim, height: 1.4)),
            if (onRetry != null) ...[const SizedBox(height: 18), OutlinedButton(onPressed: onRetry, child: const Text('Try again'))],
          ]),
        ),
      );
}

class EmptyView extends StatelessWidget {
  const EmptyView(this.title, {super.key, this.subtitle, this.icon = Icons.search_off});

  final String title;
  final String? subtitle;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 42, color: AuraColors.textMuted),
            const SizedBox(height: 14),
            Text(title, textAlign: TextAlign.center, style: display(24)),
            if (subtitle != null) ...[const SizedBox(height: 8), Text(subtitle!, textAlign: TextAlign.center, style: const TextStyle(color: AuraColors.textDim, height: 1.4))],
          ]),
        ),
      );
}

/// A loading / error / data switch for a Future that is started by the owning State.
class LoadingView extends StatelessWidget {
  const LoadingView({super.key});

  @override
  Widget build(BuildContext context) => const Center(child: CircularProgressIndicator(strokeWidth: 2, color: AuraColors.accent));
}

/// Two-column product grid used by Home, Search, Favorites and photo-search results.
class ProductGrid extends StatelessWidget {
  const ProductGrid({super.key, required this.products, required this.onOpen, this.controller, this.footer, this.favorites, this.onFavorite, this.padding});

  final List<Product> products;
  final void Function(Product, int index) onOpen;
  final ScrollController? controller;
  final Widget? footer;
  final bool Function(Product)? favorites;
  final void Function(Product)? onFavorite;
  final EdgeInsets? padding;

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      controller: controller,
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        SliverPadding(
          padding: padding ?? const EdgeInsets.fromLTRB(16, 4, 16, 16),
          sliver: SliverGrid.builder(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 18, crossAxisSpacing: 14, childAspectRatio: 0.58),
            itemCount: products.length,
            itemBuilder: (_, i) {
              final p = products[i];
              return ProductCard(
                product: p,
                onTap: () => onOpen(p, i),
                favorite: favorites?.call(p),
                onFavorite: onFavorite == null ? null : () => onFavorite!(p),
              );
            },
          ),
        ),
        if (footer case final f?) SliverToBoxAdapter(child: f),
        const SliverToBoxAdapter(child: SizedBox(height: 24)),
      ],
    );
  }
}

void showMessage(BuildContext context, String text) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text)));
}
