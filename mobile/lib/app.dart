import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'core/api_client.dart';
import 'core/config.dart';
import 'core/theme.dart';
import 'screens/account_screen.dart';
import 'screens/favorites_screen.dart';
import 'screens/home_screen.dart';
import 'screens/search_screen.dart';
import 'screens/stylist_screen.dart';
import 'services/aura_api.dart';
import 'services/state.dart';

class AuraFitApp extends StatefulWidget {
  /// [apiOverride] lets tests run the whole app against a fake API.
  const AuraFitApp({super.key, required this.prefs, this.apiOverride});

  final SharedPreferences prefs;
  final AuraApi? apiOverride;

  @override
  State<AuraFitApp> createState() => _AuraFitAppState();
}

class _AuraFitAppState extends State<AuraFitApp> {
  late final AppConfig _config = AppConfig(widget.prefs);
  late final AuthController _auth = AuthController(widget.prefs);
  late final FavoritesController _favorites = FavoritesController(_auth);
  late final AuraApi _api;

  @override
  void initState() {
    super.initState();
    final sessionId = widget.prefs.getString('session_id') ?? AuraApi.newSessionId();
    widget.prefs.setString('session_id', sessionId);
    _api = widget.apiOverride ?? AuraApi(ApiClient(baseUrl: () => _config.baseUrl, token: () => _auth.token), sessionId: sessionId);
    _auth.attach(_api);
    _favorites.attach(_api);
    _auth.restore().then((_) => _favorites.load());
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        Provider<AuraApi>.value(value: _api),
        ChangeNotifierProvider<AppConfig>.value(value: _config),
        ChangeNotifierProvider<AuthController>.value(value: _auth),
        ChangeNotifierProvider<FavoritesController>.value(value: _favorites),
      ],
      child: MaterialApp(
        title: 'AuraFit',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        home: const Shell(),
      ),
    );
  }
}

/// Five tabs. IndexedStack keeps each tab's scroll position and loaded data while you move between them.
class Shell extends StatefulWidget {
  const Shell({super.key});

  static const tabHome = 0, tabSearch = 1, tabStylist = 2, tabFavorites = 3, tabAccount = 4;

  /// Lets any screen switch tab (e.g. the Home search bar opens Search).
  static void goTo(BuildContext context, int tab) => context.findAncestorStateOfType<_ShellState>()?._select(tab);

  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  int _index = 0;
  bool? _wasSignedIn;

  void _select(int i) {
    setState(() => _index = i);
    if (i == Shell.tabFavorites) context.read<FavoritesController>().load();
  }

  @override
  Widget build(BuildContext context) {
    // when sign-in state changes, reload (or clear) the favourites
    final signedIn = context.watch<AuthController>().signedIn;
    if (_wasSignedIn != signedIn) {
      _wasSignedIn = signedIn;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) context.read<FavoritesController>().load();
      });
    }
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: IndexedStack(index: _index, children: const [
          HomeScreen(),
          SearchScreen(),
          StylistScreen(),
          FavoritesScreen(),
          AccountScreen(),
        ]),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: _select,
        height: 66,
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.search), selectedIcon: Icon(Icons.search), label: 'Search'),
          NavigationDestination(icon: Icon(Icons.auto_awesome_outlined), selectedIcon: Icon(Icons.auto_awesome), label: 'Stylist'),
          NavigationDestination(icon: Icon(Icons.favorite_border), selectedIcon: Icon(Icons.favorite), label: 'Saved'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Account'),
        ],
      ),
    );
  }
}
