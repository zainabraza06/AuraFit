import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/config.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../services/aura_api.dart';
import '../services/state.dart';

/// Pure validators, so they can be tested without a widget tree.
class Validators {
  static String? email(String? v) {
    final s = (v ?? '').trim();
    if (s.isEmpty) return 'Enter your email';
    return RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]{2,}$').hasMatch(s) ? null : 'Enter a valid email address';
  }

  static String? password(String? v) => (v ?? '').length >= 6 ? null : 'Use at least 6 characters';

  static String? name(String? v) => (v ?? '').trim().length >= 2 ? null : 'Enter your name';
}

class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    return ListView(padding: const EdgeInsets.all(20), children: [
      Text('Account', style: display(34)),
      const SizedBox(height: 18),
      auth.signedIn ? _Profile(user: auth.user!) : const _AuthForm(),
      const SizedBox(height: 30),
      const _ServerSettings(),
    ]);
  }
}

class _Profile extends StatelessWidget {
  const _Profile({required this.user});

  final AppUser user;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(color: AuraColors.card, borderRadius: BorderRadius.circular(16), border: Border.all(color: AuraColors.border)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          CircleAvatar(radius: 26, backgroundColor: AuraColors.accent.withValues(alpha: 0.2), child: Text(user.name.isEmpty ? '?' : user.name[0].toUpperCase(), style: display(26, color: AuraColors.accent))),
          const SizedBox(width: 14),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(user.name, style: display(26)), Text(user.email, style: const TextStyle(color: AuraColors.textDim, fontSize: 13))])),
        ]),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          icon: const Icon(Icons.logout, size: 18),
          label: const Text('Sign out'),
          onPressed: () async {
            await context.read<AuthController>().logout();
            if (context.mounted) context.read<FavoritesController>().clear();
          },
        ),
      ]),
    );
  }
}

class _AuthForm extends StatefulWidget {
  const _AuthForm();

  @override
  State<_AuthForm> createState() => _AuthFormState();
}

class _AuthFormState extends State<_AuthForm> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _register = false;
  bool _hide = true;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _error = null);
    final auth = context.read<AuthController>();
    try {
      if (_register) {
        await auth.register(_name.text, _email.text, _password.text);
      } else {
        await auth.login(_email.text, _password.text);
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Something went wrong. Please try again.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final busy = context.watch<AuthController>().busy;
    return Form(
      key: _form,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        SegmentedButton<bool>(
          segments: const [ButtonSegment(value: false, label: Text('Sign in')), ButtonSegment(value: true, label: Text('Create account'))],
          selected: {_register},
          onSelectionChanged: (s) => setState(() {
            _register = s.first;
            _error = null;
          }),
          style: SegmentedButton.styleFrom(selectedBackgroundColor: AuraColors.accent.withValues(alpha: 0.2), selectedForegroundColor: AuraColors.accent),
        ),
        const SizedBox(height: 16),
        if (_register) ...[
          TextFormField(controller: _name, validator: Validators.name, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Name')),
          const SizedBox(height: 12),
        ],
        TextFormField(controller: _email, validator: Validators.email, keyboardType: TextInputType.emailAddress, autocorrect: false, decoration: const InputDecoration(labelText: 'Email')),
        const SizedBox(height: 12),
        TextFormField(
          controller: _password,
          validator: Validators.password,
          obscureText: _hide,
          onFieldSubmitted: (_) => _submit(),
          decoration: InputDecoration(labelText: 'Password', suffixIcon: IconButton(icon: Icon(_hide ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 20), onPressed: () => setState(() => _hide = !_hide))),
        ),
        if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: const TextStyle(color: AuraColors.error))),
        const SizedBox(height: 18),
        FilledButton(onPressed: busy ? null : _submit, child: busy ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF1A1408))) : Text(_register ? 'Create account' : 'Sign in')),
      ]),
    );
  }
}

/// Which server the app talks to, and whether it is reachable. Also tells you whether that server is doing
/// semantic or keyword search (a small host serves keyword search).
class _ServerSettings extends StatefulWidget {
  const _ServerSettings();

  @override
  State<_ServerSettings> createState() => _ServerSettingsState();
}

class _ServerSettingsState extends State<_ServerSettings> {
  late final TextEditingController _url = TextEditingController(text: context.read<AppConfig>().baseUrl);
  String? _status;
  bool _ok = false;
  bool _testing = false;

  @override
  void dispose() {
    _url.dispose();
    super.dispose();
  }

  Future<void> _test() async {
    final config = context.read<AppConfig>();
    await config.setBaseUrl(_url.text);
    if (!mounted) return;
    setState(() {
      _testing = true;
      _status = null;
    });
    try {
      final h = await context.read<AuraApi>().health();
      if (!mounted) return;
      setState(() {
        _ok = h.ok;
        _status = 'Connected · ${h.search} search${h.visualSearch ? ' · visual photo search' : ''}';
      });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _ok = false;
          _status = e.message;
        });
      }
    } finally {
      if (mounted) setState(() => _testing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final config = context.watch<AppConfig>();
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(color: AuraColors.card, borderRadius: BorderRadius.circular(16), border: Border.all(color: AuraColors.border)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Server', style: display(24)),
        const SizedBox(height: 4),
        Text(config.isCustom ? 'Using your address.' : 'Using the default address.', style: const TextStyle(color: AuraColors.textMuted, fontSize: 12)),
        const SizedBox(height: 12),
        TextField(controller: _url, keyboardType: TextInputType.url, autocorrect: false, decoration: const InputDecoration(labelText: 'API address', hintText: 'https://your-server.example.com/api')),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: FilledButton(onPressed: _testing ? null : _test, child: Text(_testing ? 'Testing…' : 'Save and test'))),
          const SizedBox(width: 10),
          OutlinedButton(
            onPressed: () async {
              await config.setBaseUrl(null);
              _url.text = config.baseUrl;
              setState(() => _status = null);
            },
            child: const Text('Reset'),
          ),
        ]),
        if (_status != null) Padding(padding: const EdgeInsets.only(top: 12), child: Row(children: [Icon(_ok ? Icons.check_circle_outline : Icons.error_outline, size: 18, color: _ok ? AuraColors.success : AuraColors.error), const SizedBox(width: 8), Expanded(child: Text(_status!, style: TextStyle(color: _ok ? AuraColors.success : AuraColors.error, fontSize: 13)))])),
      ]),
    );
  }
}
