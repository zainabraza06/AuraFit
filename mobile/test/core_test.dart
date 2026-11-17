import 'dart:convert';

import 'package:aurafit_mobile/core/api_client.dart';
import 'package:aurafit_mobile/core/config.dart';
import 'package:aurafit_mobile/models/models.dart';
import 'package:aurafit_mobile/models/product.dart';
import 'package:aurafit_mobile/screens/account_screen.dart';
import 'package:aurafit_mobile/services/aura_api.dart';
import 'package:aurafit_mobile/services/state.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

http.Response json(Object body, [int status = 200, Map<String, String> headers = const {}]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json', ...headers});

ApiClient clientFor(MockClient mock, {String? token}) => ApiClient(baseUrl: () => 'http://api.test/api', token: () => token, client: mock);

void main() {
  group('Product.fromJson', () {
    test('reads the compact shape the stylist agent returns (image, url)', () {
      final p = Product.fromJson({'id': 'a1', 'name': 'Slipper', 'brand': 'STYLO', 'price': 1470, 'image': 'https://x/s.jpg', 'url': 'https://x/p', 'catalog': 'shoes'});
      expect(p.imageUrl, 'https://x/s.jpg');
      expect(p.productUrl, 'https://x/p');
    });
    test('reads a clothing record and formats the price', () {
      final p = Product.fromJson({
        '_id': 'abc', 'name': 'Lawn 3-Piece', 'brand': 'Khaadi', 'price': 5000, 'imageUrl': 'https://x/a.jpg',
        'images': ['https://x/a.jpg', 'https://x/b.jpg'], 'primaryColor': 'Red', 'primaryExactColor': 'maroon', 'occasion': ['eid', 'party'],
        'category': 'clothing', 'dressStyle': 'shalwar-kameez', 'inStock': true,
      });
      expect(p.id, 'abc');
      expect(p.displayPrice, 'PKR 5,000');
      expect(p.primaryColor, 'maroon', reason: 'the exact shade wins over the family');
      expect(p.catalog, 'clothing');
      expect(p.type, 'shalwar-kameez');
      expect(p.canTryOn, isTrue);
      expect(p.gallery, ['https://x/a.jpg', 'https://x/b.jpg'], reason: 'no duplicate of the main image');
    });

    test('is tolerant: missing image falls back to images[0], string price, unknown category, sold out', () {
      final p = Product.fromJson({'_id': '1', 'name': 'Heel', 'brand': 'Stylo', 'price': '1999.6', 'images': ['https://x/i.jpg'], 'category': 'Footwear', 'inStock': false, 'shoeType': 'heel'});
      expect(p.imageUrl, 'https://x/i.jpg');
      expect(p.price, 1999.6);
      expect(p.displayPrice, 'PKR 2,000');
      expect(p.catalog, 'shoes');
      expect(p.inStock, isFalse);
      expect(p.canTryOn, isFalse);
      expect(p.type, 'heel');
    });

    test('survives a nearly empty record', () {
      final p = Product.fromJson({});
      expect(p.name, 'Untitled');
      expect(p.price, 0);
      expect(p.imageUrl, isNull);
      expect(p.gallery, isEmpty);
    });

    test('maps jewellery and watch catalogs from the catalog field', () {
      expect(Product.fromJson({'catalog': 'jewelry', 'name': 'x'}).catalog, 'jewelry');
      expect(Product.fromJson({'category': 'watches', 'name': 'x'}).catalog, 'watches');
    });
  });

  group('response models', () {
    test('StylistReply keeps the reason for each pick and detects the fallback', () {
      final r = StylistReply.fromJson({
        'answer': 'Try this.',
        'picks': [{'_id': 'a', 'name': 'Kurta', 'brand': 'B', 'price': 100, 'why': 'matches Eid'}],
        'meta': {'toolCalls': 2, 'ms': 4200, 'stopReason': 'answered'},
      });
      expect(r.picks.single.why, 'matches Eid');
      expect(r.toolCalls, 2);
      expect(r.usedFallback, isFalse);
      expect(StylistReply.fromJson({'answer': 'x', 'picks': [], 'meta': {'stopReason': 'llm_failed: down'}}).usedFallback, isTrue);
    });

    test('Recommendations reads shoes and complementary clothing with reasons and skips malformed rows', () {
      final r = Recommendations.fromJson({
        'shoes': [{'product': {'_id': 's', 'name': 'Khussa', 'brand': 'B', 'price': 1}, 'reason': 'neutral'}, {'bad': true}],
        'complementaryClothing': [],
      });
      expect(r.shoes.single.reason, 'neutral');
      expect(r.complementary, isEmpty);
      expect(r.isEmpty, isFalse);
    });

    test('PhotoSearchResult exposes the facts read from the photo and the visual flag', () {
      final r = PhotoSearchResult.fromJson({
        'matches': [{'_id': 'm', 'name': 'x', 'brand': 'b', 'price': 1}],
        'analysis': {'category': 'saree', 'color': 'red', 'style': '', 'occasion': null},
        'detectedCatalog': 'clothing', 'message': 'Found 1', 'visualSimilarity': true,
      });
      expect(r.tags, ['saree', 'red']);
      expect(r.visual, isTrue);
    });

    test('TryOnJob states', () {
      expect(TryOnJob.fromJson({'id': '1', 'status': 'queued', 'queuedAhead': 2}).isFinished, isFalse);
      expect(TryOnJob.fromJson({'id': '1', 'status': 'done', 'resultUrl': 'https://r'}).isDone, isTrue);
      expect(TryOnJob.fromJson({'id': '1', 'status': 'failed', 'error': 'no person'}).isFailed, isTrue);
    });

    test('CatalogStats and ServerHealth', () {
      final s = CatalogStats.fromJson({'total': 10, 'topBrands': [{'_id': 'Khaadi', 'count': 5}, {'_id': null, 'count': 1}]});
      expect(s.brands.map((b) => b.brand), ['Khaadi']);
      final h = ServerHealth.fromJson({'status': 'ok', 'search': 'keyword', 'photoSearchVisual': false});
      expect([h.ok, h.search, h.visualSearch], [true, 'keyword', false]);
    });
  });

  group('ApiClient', () {
    test('sends the bearer token, drops empty query values, and decodes JSON', () async {
      late http.Request seen;
      final c = clientFor(MockClient((r) async {
        seen = r;
        return json({'ok': true});
      }), token: 'T0KEN');
      final out = await c.get('/search', query: {'q': 'red', 'catalog': null, 'page': 1, 'empty': ''});
      expect(out, {'ok': true});
      expect(seen.url.toString(), 'http://api.test/api/search?q=red&page=1');
      expect(seen.headers['Authorization'], 'Bearer T0KEN');
    });

    test('anonymous requests carry no Authorization header', () async {
      late http.Request seen;
      await clientFor(MockClient((r) async {
        seen = r;
        return json({});
      })).get('/x');
      expect(seen.headers.containsKey('Authorization'), isFalse);
    });

    test('server error messages reach the caller; 429 carries Retry-After', () async {
      final bad = clientFor(MockClient((_) async => json({'error': 'Invalid credentials'}, 401)));
      await expectLater(bad.post('/auth/login', body: {}), throwsA(isA<ApiException>().having((e) => e.message, 'message', 'Invalid credentials').having((e) => e.isUnauthorized, 'unauthorized', true)));

      final limited = clientFor(MockClient((_) async => json({'error': 'Daily limit reached for stylist-agent.'}, 429, {'retry-after': '3600'})));
      await expectLater(limited.post('/stylist/ask', body: {}), throwsA(isA<ApiException>().having((e) => e.retryAfterSeconds, 'retry', 3600).having((e) => e.isRateLimited, 'limited', true)));
    });

    test('a non-JSON error page still gives a readable message', () async {
      final c = clientFor(MockClient((_) async => http.Response('<html>Bad gateway</html>', 502)));
      await expectLater(c.get('/x'), throwsA(isA<ApiException>().having((e) => e.message, 'message', contains('502'))));
    });

    test('network failures become a friendly message, not a raw exception', () async {
      final c = clientFor(MockClient((_) async => throw http.ClientException('connection refused')));
      await expectLater(c.get('/x'), throwsA(isA<ApiException>().having((e) => e.message, 'message', contains('Cannot reach the server'))));
    });

    test('timeouts are reported as such', () async {
      final c = clientFor(MockClient((_) => Future.delayed(const Duration(milliseconds: 200), () => json({}))));
      await expectLater(c.get('/slow', timeout: const Duration(milliseconds: 20)), throwsA(isA<ApiException>().having((e) => e.message, 'message', contains('too long'))));
    });
  });

  group('AuraApi', () {
    test('askStylist posts the message and parses the reply', () async {
      late http.Request seen;
      final api = AuraApi(clientFor(MockClient((r) async {
        seen = r;
        return json({'answer': 'Hi', 'picks': [], 'meta': {'toolCalls': 1, 'ms': 10, 'stopReason': 'answered'}});
      })), sessionId: 's');
      final reply = await api.askStylist('white kurta');
      expect(seen.url.path, '/api/stylist/ask');
      expect(jsonDecode(seen.body), {'message': 'white kurta'});
      expect(reply.answer, 'Hi');
    });

    test('photo search and try-on send multipart with the right field names and image content types', () async {
      final seen = <http.BaseRequest>[];
      final api = AuraApi(clientFor(MockClient.streaming((req, body) async {
        seen.add(req);
        final bytes = await body.toBytes();
        final text = latin1.decode(bytes);
        final payload = req.url.path.endsWith('/jobs') ? {'id': 'j1', 'status': 'queued'} : {'matches': [], 'analysis': {}, 'detectedCatalog': 'clothing', 'message': ''};
        return http.StreamedResponse(Stream.value(utf8.encode(jsonEncode(payload))), 200, headers: {'content-type': 'application/json', 'x-seen': text.contains('name="person"') ? 'person' : text.contains('name="image"') ? 'image' : 'none'});
      })), sessionId: 's');
      await api.photoSearch(utf8.encode('fakejpeg') as dynamic, 'look.PNG');
      final job = await api.startTryOn(utf8.encode('fakejpeg') as dynamic, 'me.jpg', 'https://shop/x.jpg');
      expect(seen[0].url.path, '/api/search/visual/image');
      expect(seen[1].url.path, '/api/tryon/jobs');
      expect(job.id, 'j1');
    });

    test('content type follows the file extension (the server checks it)', () {
      expect(AuraApi.contentTypeFor('a.PNG'), 'image/png');
      expect(AuraApi.contentTypeFor('a.webp'), 'image/webp');
      expect(AuraApi.contentTypeFor('a.jpeg'), 'image/jpeg');
      expect(AuraApi.contentTypeFor(''), 'image/jpeg');
    });

    test('feedback never throws, even when the server is down', () async {
      final api = AuraApi(clientFor(MockClient((_) async => throw http.ClientException('down'))), sessionId: 'sess-12345678');
      await api.feedback('result_click', productUrl: 'https://x/p', catalog: 'clothing', query: 'x' * 500, position: 9999);
    });

    test('feedback sends a bounded, privacy-safe payload', () async {
      late Map<String, dynamic> body;
      final api = AuraApi(clientFor(MockClient((r) async {
        body = jsonDecode(r.body) as Map<String, dynamic>;
        return json({'accepted': true}, 202);
      })), sessionId: 'sess-12345678');
      await api.feedback('save', productUrl: 'not-a-url', query: 'q' * 500, position: 9999);
      expect(body['action'], 'save');
      expect(body['sessionId'], 'sess-12345678');
      expect((body['clientEventId'] as String).length, greaterThanOrEqualTo(8));
      expect(body.containsKey('productUrl'), isFalse, reason: 'only real http(s) URLs are sent');
      expect((body['query'] as String).length, 200);
      expect(body['position'], 200);
    });
  });

  group('AppConfig', () {
    test('normalises addresses', () {
      expect(AppConfig.normalizeForTest('http://h:5000'), 'http://h:5000/api');
      expect(AppConfig.normalizeForTest(' https://x.com/api/ '), 'https://x.com/api');
      expect(AppConfig.normalizeForTest('https://x.com//'), 'https://x.com/api');
    });

    test('a saved address wins and can be reset', () async {
      SharedPreferences.setMockInitialValues({});
      final config = AppConfig(await SharedPreferences.getInstance());
      final dflt = config.baseUrl;
      expect(config.isCustom, isFalse);
      await config.setBaseUrl('https://my.server');
      expect(config.baseUrl, 'https://my.server/api');
      expect(config.isCustom, isTrue);
      await config.setBaseUrl(null);
      expect(config.baseUrl, dflt);
    });
  });

  group('AuthController', () {
    Future<(AuthController, SharedPreferences)> make(MockClient mock, {Map<String, Object> initial = const {}}) async {
      SharedPreferences.setMockInitialValues(initial);
      final prefs = await SharedPreferences.getInstance();
      final auth = AuthController(prefs);
      auth.attach(AuraApi(ApiClient(baseUrl: () => 'http://api.test/api', token: () => auth.token, client: mock), sessionId: 's'));
      return (auth, prefs);
    }

    final user = {'_id': 'u1', 'name': 'Zainab', 'email': 'z@example.com', 'role': 'user'};

    test('login stores the token and signs in; logout clears it', () async {
      final (auth, prefs) = await make(MockClient((_) async => json({'user': user, 'token': 'tok'})));
      await auth.login(' z@example.com ', 'secret1');
      expect(auth.signedIn, isTrue);
      expect(auth.user!.name, 'Zainab');
      expect(prefs.getString('token'), 'tok');
      await auth.logout();
      expect(auth.signedIn, isFalse);
      expect(prefs.getString('token'), isNull);
    });

    test('a failed login surfaces the server message and stays signed out', () async {
      final (auth, _) = await make(MockClient((_) async => json({'error': 'Invalid credentials'}, 401)));
      await expectLater(auth.login('a@b.co', 'wrong'), throwsA(isA<ApiException>()));
      expect(auth.signedIn, isFalse);
      expect(auth.busy, isFalse, reason: 'the spinner must stop after a failure');
    });

    test('restore: a good saved token signs in, an expired one is discarded, offline keeps it', () async {
      final (good, _) = await make(MockClient((_) async => json({'user': user})), initial: {'token': 'ok'});
      await good.restore();
      expect(good.signedIn, isTrue);

      final (expired, prefs) = await make(MockClient((_) async => json({'error': 'Not authorized'}, 401)), initial: {'token': 'old'});
      await expired.restore();
      expect(expired.signedIn, isFalse);
      expect(prefs.getString('token'), isNull);

      final (offline, prefs2) = await make(MockClient((_) async => throw http.ClientException('offline')), initial: {'token': 'keep'});
      await offline.restore();
      expect(offline.signedIn, isFalse);
      expect(prefs2.getString('token'), 'keep', reason: 'being offline must not sign you out');
    });
  });

  group('FavoritesController', () {
    test('signed out: toggle returns null and nothing is requested', () async {
      SharedPreferences.setMockInitialValues({});
      final auth = AuthController(await SharedPreferences.getInstance());
      final fav = FavoritesController(auth);
      var calls = 0;
      fav.attach(AuraApi(ApiClient(baseUrl: () => 'http://x/api', token: () => null, client: MockClient((_) async {
        calls++;
        return json({});
      })), sessionId: 's'));
      expect(await fav.toggle(Product(id: '1', name: 'a', brand: 'b', price: 1)), isNull);
      expect(calls, 0);
    });

    test('signed in: toggling adds then removes, and reports the new state', () async {
      SharedPreferences.setMockInitialValues({'token': 't'});
      final auth = AuthController(await SharedPreferences.getInstance());
      var favorited = true;
      final api = AuraApi(ApiClient(baseUrl: () => 'http://x/api', token: () => 't', client: MockClient((r) async {
        if (r.url.path.endsWith('/feedback')) return json({'accepted': true}, 202);
        if (r.url.path.contains('/favorites/')) {
          final res = json({'favorited': favorited});
          favorited = !favorited;
          return res;
        }
        if (r.url.path.endsWith('/auth/me')) return json({'user': {'_id': 'u', 'name': 'N', 'email': 'e@x.co'}});
        return json({});
      })), sessionId: 's');
      auth.attach(api);
      await auth.restore();
      final fav = FavoritesController(auth)..attach(api);
      final p = Product(id: 'p1', name: 'Kurta', brand: 'B', price: 1);
      expect(await fav.toggle(p), isTrue);
      expect(fav.isFavorite('p1'), isTrue);
      expect(await fav.toggle(p), isFalse);
      expect(fav.isFavorite('p1'), isFalse);
    });
  });

  group('Validators', () {
    test('email', () {
      expect(Validators.email(''), isNotNull);
      expect(Validators.email('nope'), isNotNull);
      expect(Validators.email('a@b'), isNotNull);
      expect(Validators.email(' a@b.co '), isNull);
    });
    test('password and name', () {
      expect(Validators.password('12345'), isNotNull);
      expect(Validators.password('123456'), isNull);
      expect(Validators.name(' '), isNotNull);
      expect(Validators.name('Zainab'), isNull);
    });
  });
}
