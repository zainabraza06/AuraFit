import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../services/aura_api.dart';
import '../widgets/common.dart';
import 'product_screen.dart';

/// One turn of the conversation: what you asked, and either the agent's reply or an error.
class _Turn {
  _Turn(this.question);

  final String question;
  StylistReply? reply;
  String? error;
  bool get pending => reply == null && error == null;
}

class StylistScreen extends StatefulWidget {
  const StylistScreen({super.key});

  @override
  State<StylistScreen> createState() => _StylistScreenState();
}

class _StylistScreenState extends State<StylistScreen> {
  static const _suggestions = [
    'A white kurta for Eid under 8000 PKR',
    'A green mehndi outfit with shoes, 8000 PKR in total',
    'Navy blue formal dress with matching jewellery',
    'A watch for a child',
  ];

  final _controller = TextEditingController();
  final _scroll = ScrollController();
  final List<_Turn> _turns = [];
  bool get _busy => _turns.isNotEmpty && _turns.last.pending;

  @override
  void dispose() {
    _controller.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _send(String text) async {
    final q = text.trim();
    if (q.length < 3 || _busy) return;
    _controller.clear();
    final turn = _Turn(q);
    setState(() => _turns.add(turn));
    _scrollToEnd();
    try {
      final reply = await context.read<AuraApi>().askStylist(q);
      if (mounted) setState(() => turn.reply = reply);
    } on ApiException catch (e) {
      final wait = e.retryAfterSeconds;
      if (mounted) setState(() => turn.error = e.isRateLimited && wait != null ? '${e.message}\nTry again in ${(wait / 60).ceil()} min.' : e.message);
    } catch (_) {
      if (mounted) setState(() => turn.error = 'Something went wrong. Please try again.');
    }
    _scrollToEnd();
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent + 200, duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 6),
        child: Row(children: [
          Flexible(child: Text('Your stylist', maxLines: 1, overflow: TextOverflow.ellipsis, style: display(32))),
          const SizedBox(width: 8),
          const Icon(Icons.auto_awesome, size: 18, color: AuraColors.accent),
        ]),
      ),
      Expanded(
        child: _turns.isEmpty
            ? _intro()
            : ListView.builder(
                controller: _scroll,
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                itemCount: _turns.length,
                itemBuilder: (_, i) => _TurnView(turn: _turns[i]),
              ),
      ),
      SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 6, 16, 12),
          child: Row(children: [
            Expanded(
              child: TextField(
                controller: _controller,
                enabled: !_busy,
                minLines: 1,
                maxLines: 3,
                maxLength: 500,
                textInputAction: TextInputAction.send,
                onSubmitted: _send,
                decoration: const InputDecoration(hintText: 'Describe the look you want…', counterText: ''),
              ),
            ),
            const SizedBox(width: 10),
            IconButton.filled(
              style: IconButton.styleFrom(backgroundColor: AuraColors.accent, foregroundColor: const Color(0xFF1A1408), minimumSize: const Size(48, 48)),
              onPressed: _busy ? null : () => _send(_controller.text),
              icon: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF1A1408))) : const Icon(Icons.arrow_upward),
            ),
          ]),
        ),
      ),
    ]);
  }

  Widget _intro() => ListView(padding: const EdgeInsets.all(20), children: [
        const Text(
          'Tell me the occasion, colours and budget. I look through the live catalog, pair clothes with shoes and jewellery, and only recommend things that are actually in stock.',
          style: TextStyle(color: AuraColors.textDim, height: 1.5),
        ),
        const SizedBox(height: 20),
        for (final s in _suggestions)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: InkWell(
              onTap: () => _send(s),
              borderRadius: BorderRadius.circular(12),
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: AuraColors.card, borderRadius: BorderRadius.circular(12), border: Border.all(color: AuraColors.border)),
                child: Row(children: [
                  Expanded(child: Text(s)),
                  const Icon(Icons.north_east, size: 16, color: AuraColors.accent),
                ]),
              ),
            ),
          ),
      ]);
}

class _TurnView extends StatelessWidget {
  const _TurnView({required this.turn});

  final _Turn turn;

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Align(
        alignment: Alignment.centerRight,
        child: Container(
          margin: const EdgeInsets.only(top: 10, left: 48),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
          decoration: BoxDecoration(color: AuraColors.accent.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(16), border: Border.all(color: AuraColors.accentDeep)),
          child: Text(turn.question),
        ),
      ),
      const SizedBox(height: 10),
      if (turn.pending)
        const Padding(
          padding: EdgeInsets.all(8),
          child: Row(children: [
            SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: AuraColors.accent)),
            SizedBox(width: 12),
            Text('Browsing the catalog…', style: TextStyle(color: AuraColors.textDim)),
          ]),
        )
      else if (turn.error != null)
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: AuraColors.error.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(14), border: Border.all(color: AuraColors.error.withValues(alpha: 0.4))),
          child: Text(turn.error!, style: const TextStyle(color: AuraColors.text, height: 1.4)),
        )
      else
        _Reply(reply: turn.reply!, question: turn.question),
    ]);
  }
}

class _Reply extends StatelessWidget {
  const _Reply({required this.reply, required this.question});

  final StylistReply reply;
  final String question;

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: AuraColors.card, borderRadius: BorderRadius.circular(16), border: Border.all(color: AuraColors.border)),
        child: Text(reply.answer, style: const TextStyle(height: 1.5)),
      ),
      if (reply.picks.isNotEmpty) ...[
        const SizedBox(height: 12),
        SizedBox(
          height: 318,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: reply.picks.length,
            separatorBuilder: (_, _) => const SizedBox(width: 12),
            itemBuilder: (_, i) {
              final p = reply.picks[i];
              return SizedBox(
                width: 156,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Expanded(child: ProductCard(product: p, onTap: () => openProduct(context, p, surface: 'agent', position: i, query: question))),
                  if (p.why != null && p.why!.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(p.why!, maxLines: 3, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, color: AuraColors.textMuted, height: 1.35)),
                  ],
                ]),
              );
            },
          ),
        ),
      ],
      Padding(
        padding: const EdgeInsets.only(top: 8, left: 4),
        child: Text(
          reply.usedFallback ? 'Showing search results: the stylist AI was unavailable' : '${reply.toolCalls} catalog lookups · ${(reply.ms / 1000).toStringAsFixed(1)} s',
          style: const TextStyle(fontSize: 11, color: AuraColors.textMuted),
        ),
      ),
    ]);
  }
}
