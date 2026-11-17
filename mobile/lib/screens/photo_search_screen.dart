import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../services/aura_api.dart';
import '../services/state.dart';
import '../widgets/common.dart';
import 'product_screen.dart';

/// Find products that look like a photo: from your gallery or the camera.
class PhotoSearchScreen extends StatefulWidget {
  const PhotoSearchScreen({super.key, this.picker});

  /// Injectable so tests need no platform plugin.
  final Future<XFile?> Function(ImageSource source)? picker;

  @override
  State<PhotoSearchScreen> createState() => _PhotoSearchScreenState();
}

class _PhotoSearchScreenState extends State<PhotoSearchScreen> {
  Uint8List? _bytes;
  PhotoSearchResult? _result;
  String? _error;
  bool _loading = false;

  Future<void> _pick(ImageSource source) async {
    final picker = widget.picker ?? (s) => ImagePicker().pickImage(source: s, maxWidth: 1600, imageQuality: 85);
    final api = context.read<AuraApi>();
    final file = await picker(source);
    if (file == null) return;
    final bytes = await file.readAsBytes();
    if (!mounted) return;
    setState(() {
      _bytes = bytes;
      _result = null;
      _error = null;
      _loading = true;
    });
    try {
      final r = await api.photoSearch(bytes, file.name);
      if (mounted) setState(() => _result = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Something went wrong. Please try again.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final favorites = context.watch<FavoritesController>();
    final r = _result;
    return Scaffold(
      appBar: AppBar(title: const Text('Search with a photo')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_bytes == null) _picker() else _preview(),
          if (_loading) const Padding(padding: EdgeInsets.all(32), child: LoadingView()),
          if (_error != null) SizedBox(height: 220, child: ErrorView(_error!, onRetry: () => _pick(ImageSource.gallery))),
          if (r != null) ...[
            const SizedBox(height: 18),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final t in r.tags) Chip(label: Text(t)),
              if (r.visual) const Chip(avatar: Icon(Icons.visibility_outlined, size: 16, color: AuraColors.accent), label: Text('Visual match')),
            ]),
            const SizedBox(height: 10),
            if (r.message.isNotEmpty) Text(r.message, style: const TextStyle(color: AuraColors.textDim, height: 1.4)),
            const SizedBox(height: 14),
            if (r.matches.isEmpty)
              const SizedBox(height: 200, child: EmptyView('No close matches', subtitle: 'Try a clearer photo, or one with the item on its own.', icon: Icons.image_search))
            else
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 18, crossAxisSpacing: 14, childAspectRatio: 0.58),
                itemCount: r.matches.length,
                itemBuilder: (_, i) => ProductCard(
                  product: r.matches[i],
                  favorite: favorites.isFavorite(r.matches[i].id),
                  onFavorite: () => toggleFavorite(context, r.matches[i]),
                  onTap: () => openProduct(context, r.matches[i], surface: 'search', position: i, query: 'photo'),
                ),
              ),
          ],
        ],
      ),
    );
  }

  Widget _picker() => Container(
        padding: const EdgeInsets.all(28),
        decoration: BoxDecoration(color: AuraColors.card, borderRadius: BorderRadius.circular(18), border: Border.all(color: AuraColors.border)),
        child: Column(children: [
          const Icon(Icons.image_search, size: 44, color: AuraColors.accent),
          const SizedBox(height: 14),
          Text('Show me what you like', style: display(26)),
          const SizedBox(height: 8),
          const Text('A photo of an outfit, shoes or jewellery. I find similar pieces that are in stock.', textAlign: TextAlign.center, style: TextStyle(color: AuraColors.textDim, height: 1.45)),
          const SizedBox(height: 20),
          Row(children: [
            Expanded(child: FilledButton.icon(icon: const Icon(Icons.photo_library_outlined, size: 18), label: const Text('Gallery'), onPressed: () => _pick(ImageSource.gallery))),
            const SizedBox(width: 12),
            Expanded(child: OutlinedButton.icon(icon: const Icon(Icons.photo_camera_outlined, size: 18), label: const Text('Camera'), onPressed: () => _pick(ImageSource.camera))),
          ]),
        ]),
      );

  Widget _preview() => Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        ClipRRect(borderRadius: BorderRadius.circular(12), child: Image.memory(_bytes!, width: 96, height: 120, fit: BoxFit.cover, errorBuilder: (_, _, _) => const SizedBox(width: 96, height: 120, child: ColoredBox(color: AuraColors.card, child: Icon(Icons.image_not_supported_outlined, color: AuraColors.textMuted))))),
        const SizedBox(width: 14),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(_loading ? 'Looking at your photo…' : 'Your photo', style: display(22)),
            const SizedBox(height: 10),
            Wrap(spacing: 8, children: [
              OutlinedButton(onPressed: _loading ? null : () => _pick(ImageSource.gallery), child: const Text('Another')),
              TextButton(onPressed: _loading ? null : () => _pick(ImageSource.camera), child: const Text('Camera')),
            ]),
          ]),
        ),
      ]);
}
