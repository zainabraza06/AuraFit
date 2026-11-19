import 'dart:convert';
import 'dart:typed_data';

import 'package:aurafit_mobile/app.dart';
import 'package:aurafit_mobile/core/api_client.dart';
import 'package:aurafit_mobile/core/config.dart';
import 'package:aurafit_mobile/core/theme.dart';
import 'package:aurafit_mobile/models/models.dart';
import 'package:aurafit_mobile/models/product.dart';
import 'package:aurafit_mobile/screens/photo_search_screen.dart';
import 'package:aurafit_mobile/screens/tryon_screen.dart';
import 'package:aurafit_mobile/services/aura_api.dart';
import 'package:aurafit_mobile/services/state.dart';
import 'package:aurafit_mobile/widgets/common.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// A valid 1x1 PNG, so Image.memory has something it can decode.
final Uint8List _png = base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=');

Product makeProduct(String id, String name, {String catalog = 'clothing', num price = 4999}) =>
    Product(id: id, name: name, brand: 'Khaadi', price: price, imageUrl: 'https://img/$id.jpg', catalog: catalog, description: 'A lovely piece for any occasion.', occasion: const ['eid'], primaryColor: 'maroon');

/// An API that never touches the network. Every behaviour a test cares about is a field it can change.
class FakeApi extends AuraApi {
  FakeApi() : super(ApiClient(baseUrl: () => 'http://fake/api', token: () => null, client: MockClient((_) async => http.Response('{}', 200))), sessionId: 'sess-test-1234');

  List<Product> catalog = [makeProduct('1', 'Maroon Lawn Suit'), makeProduct('2', 'Green Kurta'), makeProduct('3', 'Gold Jhumka', catalog: 'jewelry', price: 1299)];
  ApiException? searchError;
  ApiException? stylistError;
  StylistReply reply = StylistReply(answer: 'Here is a look for Eid.', picks: [makeProduct('1', 'Maroon Lawn Suit')], toolCalls: 2, ms: 3200);
  final List<String> asked = [];
  final List<String> feedbackActions = [];
  final List<String> searches = [];
  List<TryOnJob> jobScript = [];
  int _jobCall = 0;
  bool loggedIn = false;

  @override
  Future<List<Product>> featured() async => catalog.take(2).toList();

  @override
  Future<CatalogStats> stats() async => CatalogStats(total: 3315, brands: [BrandCount('Khaadi', 513), BrandCount('Limelight', 295)]);

  @override
  Future<ProductPage> products({int page = 1, int limit = 20, String? brand}) async => ProductPage(page == 1 ? catalog : [], Pagination(page: page, total: catalog.length, hasMore: false));

  @override
  Future<Product> product(String id) async => catalog.firstWhere((p) => p.id == id);

  @override
  Future<ProductPage> search(String q, {String? catalog, int page = 1, int limit = 20}) async {
    searches.add('$q|${catalog ?? ''}');
    if (searchError != null) throw searchError!;
    final hits = this.catalog.where((p) => (catalog == null || p.catalog == catalog) && p.name.toLowerCase().contains(q.toLowerCase())).toList();
    return ProductPage(hits, Pagination(page: 1, total: hits.length, hasMore: false));
  }

  @override
  Future<Recommendations> recommendations(String id) async => Recommendations(shoes: [RecItem(makeProduct('s1', 'Gold Khussa', catalog: 'shoes'), 'Neutral gold balances the maroon.')], complementary: []);

  @override
  Future<StylistReply> askStylist(String message) async {
    asked.add(message);
    if (stylistError != null) throw stylistError!;
    return reply;
  }

  @override
  Future<PhotoSearchResult> photoSearch(Uint8List bytes, String filename) async => PhotoSearchResult(
        matches: [catalog.first],
        analysis: const {'category': 'kurta', 'color': 'maroon'},
        detectedCatalog: 'clothing',
        message: 'Found 1 item matching your photo!',
        visual: true,
      );

  @override
  Future<TryOnJob> startTryOn(Uint8List personPhoto, String filename, String clothingUrl) async => jobScript.first;

  @override
  Future<TryOnJob> tryOnJob(String id) async => jobScript[(++_jobCall).clamp(0, jobScript.length - 1)];

  @override
  Future<(AppUser, String)> login(String email, String password) async {
    if (password != 'right-pass') throw ApiException('Invalid email or password', status: 401);
    loggedIn = true;
    return (AppUser(id: 'u1', name: 'Zainab', email: email), 'token-1');
  }

  @override
  Future<AppUser> me() async => AppUser(id: 'u1', name: 'Zainab', email: 'z@example.com');

  @override
  Future<List<Product>> favorites() async => loggedIn ? [catalog.first] : [];

  @override
  Future<bool> toggleFavorite(String productId) async => true;

  @override
  Future<void> feedback(String action, {String? productUrl, String? catalog, String? query, int? position, String surface = 'search'}) async => feedbackActions.add(action);

  @override
  Future<ServerHealth> health() async => ServerHealth(ok: true, search: 'keyword', visualSearch: false);
}

Future<(FakeApi, SharedPreferences)> boot(WidgetTester tester, {Map<String, Object> prefs = const {}, FakeApi? api}) async {
  SharedPreferences.setMockInitialValues(prefs);
  final p = await SharedPreferences.getInstance();
  final fake = api ?? FakeApi();
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 2.75;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(AuraFitApp(prefs: p, apiOverride: fake));
  await tester.pumpAndSettle();
  return (fake, p);
}

void phoneSized(WidgetTester tester) {
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 2.75;
  addTearDown(tester.view.reset);
}

Future<void> tab(WidgetTester tester, String label) async {
  await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text(label)));
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() {
    AuraFonts.enabled = false;
    ProductImage.debugBuilder = (url, fit) => ColoredBox(color: Colors.brown, child: Center(child: Text('img', style: TextStyle(fontSize: 1, color: Colors.brown.shade700))));
  });
  tearDownAll(() {
    AuraFonts.enabled = true;
    ProductImage.debugBuilder = null;
  });

  testWidgets('Home shows the brand, catalog size, featured and the product grid', (tester) async {
    await boot(tester);
    expect(find.text('AuraFit'), findsOneWidget);
    expect(find.textContaining('3315 pieces'), findsOneWidget);
    expect(find.text('Featured'), findsOneWidget);
    expect(find.text('Khaadi'), findsWidgets);
    expect(find.text('Maroon Lawn Suit'), findsWidgets);
    expect(find.text('PKR 4,999'), findsWidgets);
  });

  testWidgets('opening a product shows details, "complete the look", and records the click as feedback', (tester) async {
    final (api, _) = await boot(tester);
    await tester.tap(find.text('Green Kurta').first);
    await tester.pumpAndSettle();
    expect(find.text('Green Kurta'), findsWidgets);
    expect(find.text('Shoes to match'), findsOneWidget);
    expect(find.text('Gold Khussa'), findsOneWidget);
    expect(find.text('Neutral gold balances the maroon.'), findsOneWidget);
    expect(find.text('Try on'), findsOneWidget);
    expect(find.textContaining('View on Khaadi'), findsOneWidget);
    expect(api.feedbackActions, contains('result_click'));
  });

  testWidgets('search finds products, filters by catalog, and says so when nothing matches', (tester) async {
    final (api, _) = await boot(tester);
    await tab(tester, 'Search');
    expect(find.text('Try asking for…'), findsOneWidget);

    await tester.enterText(find.byType(TextField).first, 'kurta');
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pumpAndSettle();
    expect(find.text('Green Kurta'), findsOneWidget);
    expect(api.searches, contains('kurta|'));

    await tester.scrollUntilVisible(find.text('Jewellery'), 120, scrollable: find.descendant(of: find.byType(ListView).first, matching: find.byType(Scrollable)));
    await tester.ensureVisible(find.text('Jewellery'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Jewellery'));
    await tester.pumpAndSettle();
    expect(api.searches.last, 'kurta|jewelry');
    expect(find.textContaining('Nothing found'), findsOneWidget);
  });

  testWidgets('a search error is shown with a retry, not a blank screen', (tester) async {
    final (api, _) = await boot(tester);
    api.searchError = ApiException('Cannot reach the server.');
    await tab(tester, 'Search');
    await tester.enterText(find.byType(TextField).first, 'lehnga');
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pumpAndSettle();
    expect(find.text('Cannot reach the server.'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
  });

  testWidgets('the stylist answers a suggested request and shows the picks with their reasons', (tester) async {
    final (api, _) = await boot(tester);
    api.reply = StylistReply(answer: 'Here is a look for Eid.', picks: [Product(id: '1', name: 'Maroon Lawn Suit', brand: 'Khaadi', price: 4999, imageUrl: 'https://img/1.jpg', why: 'Matches your colour and budget')], toolCalls: 2, ms: 3200);
    await tab(tester, 'Stylist');
    await tester.tap(find.text('A white kurta for Eid under 8000 PKR'));
    await tester.pumpAndSettle();
    expect(api.asked.single, 'A white kurta for Eid under 8000 PKR');
    expect(find.text('Here is a look for Eid.'), findsOneWidget);
    expect(find.text('Matches your colour and budget'), findsOneWidget);
    expect(find.textContaining('2 catalog lookups'), findsOneWidget);
  });

  testWidgets('a rate-limited stylist tells you when to come back', (tester) async {
    final (api, _) = await boot(tester);
    api.stylistError = ApiException('Daily limit reached for stylist-agent.', status: 429, retryAfterSeconds: 7200);
    await tab(tester, 'Stylist');
    await tester.enterText(find.byType(TextField), 'a green mehndi outfit');
    await tester.tap(find.byIcon(Icons.arrow_upward));
    await tester.pumpAndSettle();
    expect(find.textContaining('Daily limit reached'), findsOneWidget);
    expect(find.textContaining('Try again in 120 min'), findsOneWidget);
  });

  testWidgets('Saved asks you to sign in; after signing in the list loads', (tester) async {
    final (api, _) = await boot(tester);
    await tab(tester, 'Saved');
    expect(find.text('Save what you love'), findsOneWidget);

    await tester.tap(find.text('Sign in').last);
    await tester.pumpAndSettle();
    expect(find.text('Account'), findsWidgets);

    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'z@example.com');
    await tester.enterText(find.widgetWithText(TextFormField, 'Password'), 'right-pass');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();
    expect(api.loggedIn, isTrue);
    expect(find.text('Zainab'), findsWidgets);

    await tab(tester, 'Saved');
    expect(find.text('Maroon Lawn Suit'), findsOneWidget);
  });

  testWidgets('sign-in validates before calling the server and shows server errors', (tester) async {
    await boot(tester);
    await tab(tester, 'Account');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();
    expect(find.text('Enter your email'), findsOneWidget);
    expect(find.text('Use at least 6 characters'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'z@example.com');
    await tester.enterText(find.widgetWithText(TextFormField, 'Password'), 'wrong-pass');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();
    expect(find.text('Invalid email or password'), findsOneWidget);
  });

  testWidgets('a saved token restores the session on launch', (tester) async {
    await boot(tester, prefs: {'token': 'saved-token'});
    await tab(tester, 'Account');
    expect(find.text('Zainab'), findsWidgets);
    expect(find.text('Sign out'), findsOneWidget);
  });

  testWidgets('the server setting tests the connection and reports the search mode', (tester) async {
    await boot(tester);
    await tab(tester, 'Account');
    await tester.scrollUntilVisible(find.text('Save and test'), 300, scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Save and test'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Connected · keyword search'), findsOneWidget);
  });

  testWidgets('photo search: pick an image, see what was read from it and the matches', (tester) async {
    phoneSized(tester);
    final fake = FakeApi();
    SharedPreferences.setMockInitialValues({});
    await tester.pumpWidget(MaterialApp(
      theme: buildTheme(),
      home: _Harness(api: fake, child: PhotoSearchScreen(picker: (_) async => XFile.fromData(_png, name: 'look.jpg'))),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Gallery'));
    await tester.pumpAndSettle();
    expect(find.text('kurta'), findsOneWidget);
    expect(find.text('maroon'), findsOneWidget);
    expect(find.text('Visual match'), findsOneWidget);
    expect(find.text('Maroon Lawn Suit'), findsOneWidget);
  });

  testWidgets('try-on: submit, watch the queue, then see the result', (tester) async {
    phoneSized(tester);
    final fake = FakeApi()
      ..jobScript = [
        TryOnJob(id: 'j1', status: 'queued', queuedAhead: 1),
        TryOnJob(id: 'j1', status: 'running'),
        TryOnJob(id: 'j1', status: 'done', resultUrl: 'https://img/result.jpg'),
      ];
    SharedPreferences.setMockInitialValues({});
    await tester.pumpWidget(MaterialApp(
      theme: buildTheme(),
      home: _Harness(api: fake, child: TryOnScreen(product: makeProduct('1', 'Maroon Lawn Suit'), pollEvery: const Duration(milliseconds: 50), picker: (_) async => XFile.fromData(_png, name: 'me.jpg'))),
    ));
    await tester.pumpAndSettle();
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Generate try-on')).onPressed, isNull, reason: 'needs a photo first');

    await tester.tap(find.text('Choose photo'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Generate try-on'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));
    expect(find.textContaining('1 ahead of you'), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 60));
    expect(find.textContaining('Generating your look'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 60));
    await tester.pumpAndSettle();
    expect(find.text('Your look'), findsOneWidget);
  });

  testWidgets('try-on: a failed job explains why', (tester) async {
    phoneSized(tester);
    final fake = FakeApi()..jobScript = [TryOnJob(id: 'j2', status: 'failed', error: 'We could not see a person in the photo.')];
    SharedPreferences.setMockInitialValues({});
    await tester.pumpWidget(MaterialApp(
      theme: buildTheme(),
      home: _Harness(api: fake, child: TryOnScreen(product: makeProduct('1', 'Maroon Lawn Suit'), picker: (_) async => XFile.fromData(_png, name: 'me.png'))),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Choose photo'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Generate try-on'));
    await tester.pumpAndSettle();
    expect(find.text('We could not see a person in the photo.'), findsOneWidget);
  });
}

/// The providers a pushed screen needs (API, config, auth, favourites) without the whole app shell.
class AuraFitHarness extends StatefulWidget {
  const AuraFitHarness({super.key, required this.prefs, required this.api, required this.child});

  final SharedPreferences prefs;
  final FakeApi api;
  final Widget child;

  @override
  State<AuraFitHarness> createState() => _AuraFitHarnessState();
}

class _AuraFitHarnessState extends State<AuraFitHarness> {
  late final AppConfig config = AppConfig(widget.prefs);
  late final AuthController auth = AuthController(widget.prefs)..attach(widget.api);
  late final FavoritesController favorites = FavoritesController(auth)..attach(widget.api);

  @override
  Widget build(BuildContext context) => MultiProvider(
        providers: [
          Provider<AuraApi>.value(value: widget.api),
          ChangeNotifierProvider<AppConfig>.value(value: config),
          ChangeNotifierProvider<AuthController>.value(value: auth),
          ChangeNotifierProvider<FavoritesController>.value(value: favorites),
        ],
        child: widget.child,
      );
}

/// Provides what a pushed screen needs (the API, auth and favourites) without the whole app shell.
class _Harness extends StatelessWidget {
  const _Harness({required this.api, required this.child});

  final FakeApi api;
  final Widget child;

  @override
  Widget build(BuildContext context) => FutureBuilder<SharedPreferences>(
        future: SharedPreferences.getInstance(),
        builder: (context, snap) => snap.hasData ? AuraFitHarness(prefs: snap.data!, api: api, child: child) : const SizedBox.shrink(),
      );
}
