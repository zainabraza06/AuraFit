import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../models/product.dart';
import '../services/aura_api.dart';
import '../widgets/common.dart';

/// Virtual try-on as a background job: submit, then poll until it is done.
/// (The server queues the work, so this screen never holds one HTTP request open for a minute or two.)
class TryOnScreen extends StatefulWidget {
  const TryOnScreen({super.key, required this.product, this.picker, this.pollEvery = const Duration(seconds: 3)});

  final Product product;
  final Future<XFile?> Function(ImageSource source)? picker;
  final Duration pollEvery;

  @override
  State<TryOnScreen> createState() => _TryOnScreenState();
}

class _TryOnScreenState extends State<TryOnScreen> {
  static const _giveUpAfter = Duration(minutes: 5);

  Uint8List? _photo;
  String _filename = 'photo.jpg';
  TryOnJob? _job;
  String? _error;
  bool _submitting = false;
  Timer? _poll;
  DateTime? _startedAt;

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  bool get _working => _submitting || (_job != null && !_job!.isFinished);

  Future<void> _pickPhoto(ImageSource source) async {
    final pick = widget.picker ?? (s) => ImagePicker().pickImage(source: s, maxWidth: 1600, imageQuality: 88);
    final file = await pick(source);
    if (file == null) return;
    final bytes = await file.readAsBytes();
    setState(() {
      _photo = bytes;
      _filename = file.name;
      _job = null;
      _error = null;
    });
  }

  Future<void> _start() async {
    final photo = _photo;
    final url = widget.product.imageUrl;
    if (photo == null || url == null) return;
    setState(() {
      _submitting = true;
      _error = null;
      _job = null;
    });
    try {
      final job = await context.read<AuraApi>().startTryOn(photo, _filename, url);
      if (!mounted) return;
      setState(() => _job = job);
      if (!job.isFinished) {
        _startedAt = DateTime.now();
        _poll = Timer.periodic(widget.pollEvery, (_) => _check());
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Something went wrong. Please try again.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _check() async {
    final job = _job;
    if (job == null) return;
    if (DateTime.now().difference(_startedAt!) > _giveUpAfter) {
      _poll?.cancel();
      setState(() => _error = 'This is taking longer than expected. Please try again later.');
      return;
    }
    try {
      final next = await context.read<AuraApi>().tryOnJob(job.id);
      if (!mounted) return;
      setState(() => _job = next);
      if (next.isFinished) _poll?.cancel();
    } on ApiException catch (e) {
      // a single failed poll is not fatal (flaky connection); a 404 means the job is gone
      if (e.status == 404 && mounted) {
        _poll?.cancel();
        setState(() => _error = 'The server lost track of this try-on. Please start again.');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.product;
    final job = _job;
    return Scaffold(
      appBar: AppBar(title: const Text('Try it on')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Row(children: [
          Expanded(child: _tile('You', child: _photo == null ? const Icon(Icons.person_outline, size: 40, color: AuraColors.textMuted) : Image.memory(_photo!, fit: BoxFit.cover, errorBuilder: (_, _, _) => const Icon(Icons.image_not_supported_outlined, size: 40, color: AuraColors.textMuted)))),
          const Padding(padding: EdgeInsets.symmetric(horizontal: 10), child: Icon(Icons.add, color: AuraColors.accent)),
          Expanded(child: _tile(p.name, child: ProductImage(p.imageUrl))),
        ]),
        const SizedBox(height: 14),
        Row(children: [
          Expanded(child: OutlinedButton.icon(icon: const Icon(Icons.photo_library_outlined, size: 18), label: const Text('Choose photo'), onPressed: _working ? null : () => _pickPhoto(ImageSource.gallery))),
          const SizedBox(width: 10),
          Expanded(child: OutlinedButton.icon(icon: const Icon(Icons.photo_camera_outlined, size: 18), label: const Text('Camera'), onPressed: _working ? null : () => _pickPhoto(ImageSource.camera))),
        ]),
        const SizedBox(height: 8),
        const Text('Use a clear, full-length photo of yourself, facing the camera.', style: TextStyle(fontSize: 12, color: AuraColors.textMuted)),
        const SizedBox(height: 18),
        FilledButton.icon(
          icon: const Icon(Icons.auto_fix_high, size: 18),
          label: Text(_working ? 'Working on it…' : 'Generate try-on'),
          onPressed: (_photo == null || _working) ? null : _start,
        ),
        const SizedBox(height: 22),
        if (_working) _progress(job),
        if (_error != null) _message(_error!, error: true),
        if (job != null && job.isFailed && _error == null) _message(job.error ?? 'The try-on could not be generated.', error: true),
        if (job != null && job.isDone && job.resultUrl != null) ...[
          Text('Your look', style: display(26)),
          const SizedBox(height: 10),
          ClipRRect(borderRadius: BorderRadius.circular(16), child: AspectRatio(aspectRatio: 0.75, child: ProductImage(job.resultUrl, fit: BoxFit.contain))),
          if (job.cached) const Padding(padding: EdgeInsets.only(top: 8), child: Text('Shown instantly: you tried this combination before.', style: TextStyle(fontSize: 12, color: AuraColors.textMuted))),
        ],
      ]),
    );
  }

  Widget _tile(String label, {required Widget child}) => Column(children: [
        AspectRatio(
          aspectRatio: 0.78,
          child: ClipRRect(borderRadius: BorderRadius.circular(14), child: ColoredBox(color: AuraColors.card, child: Center(child: SizedBox.expand(child: FittedBox(fit: BoxFit.cover, clipBehavior: Clip.hardEdge, child: SizedBox(width: 160, height: 205, child: Center(child: child))))))),
        ),
        const SizedBox(height: 6),
        Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: AuraColors.textDim)),
      ]);

  Widget _progress(TryOnJob? job) {
    final text = job == null
        ? 'Sending your photo…'
        : job.status == 'queued'
            ? (job.queuedAhead > 0 ? 'In the queue: ${job.queuedAhead} ahead of you' : 'In the queue…')
            : 'Generating your look. This usually takes one to two minutes.';
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: AuraColors.card, borderRadius: BorderRadius.circular(14), border: Border.all(color: AuraColors.border)),
      child: Row(children: [
        const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: AuraColors.accent)),
        const SizedBox(width: 14),
        Expanded(child: Text(text, style: const TextStyle(height: 1.4))),
      ]),
    );
  }

  Widget _message(String text, {bool error = false}) => Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: (error ? AuraColors.error : AuraColors.accent).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(14), border: Border.all(color: (error ? AuraColors.error : AuraColors.accent).withValues(alpha: 0.4))),
        child: Text(text, style: const TextStyle(height: 1.4)),
      );
}
