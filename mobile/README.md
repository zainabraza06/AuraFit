# AuraFit mobile (Flutter)

The mobile client for the AuraFit API: Android, iOS and web from one codebase.

| Tab | What it does |
|---|---|
| **Home** | featured pieces, brand filter, endless "new arrivals" grid, pull to refresh |
| **Search** | one box over clothing, shoes, jewellery and watches, with catalog filter; **camera button = search with a photo** |
| **Stylist** | chat with the AI stylist (`POST /api/stylist/ask`): describe an occasion, colours and a budget, get in-stock picks with the reason for each |
| **Saved** | your favourites (needs an account) |
| **Account** | sign in / register, and the server address with a connection test |

Product pages show the gallery, details, "shoes to match" / "pairs well with" (each with the reason), **Try on** (virtual try-on as a background job: submit, then watch the queue) and a link to the retailer.
The app also reports anonymous interaction events (`POST /api/feedback`: clicks, saves, try-on starts), which flow through Kafka into MongoDB. They carry a random per-device id, never your account.

## Run it

```bash
cd mobile
flutter pub get

# 1. start the API (from the repo root)
cd ../backend && npm run dev            # http://localhost:5000

# 2. run the app
cd ../mobile
flutter run -d chrome                                        # web, talks to http://localhost:5000/api
flutter run -d <android-emulator>                            # talks to http://10.0.2.2:5000/api (the host, from the emulator)
flutter run --dart-define=API_BASE_URL=https://your-server.example.com/api
```

The server can also be changed inside the app (Account → Server → *Save and test*). The test reports whether the server is doing **semantic** or **keyword** search: a small host (under 1.8 GB RAM) serves keyword search.
On a physical phone use your computer's LAN address (`http://192.168.x.x:5000/api`), and note that Android blocks plain `http://` to non-local hosts in release builds: use `https://` for a real deployment.

## Build

```bash
flutter build apk --release        # Android
flutter build web --release        # web
flutter build ios --release        # iOS (on a Mac)
```

## Layout

```
lib/
  main.dart  app.dart                 entry, providers, the 5-tab shell
  core/       config.dart             server address (dart-define, saved override, platform default)
              api_client.dart         JSON/multipart over http, bearer token, friendly errors, 429 Retry-After
              theme.dart              the web app's look: near-black, champagne gold, Cormorant Garamond + Inter
  models/     product.dart models.dart   tolerant parsing of the four catalog schemas
  services/   aura_api.dart           every endpoint, typed (screens never build URLs)
              state.dart              AuthController, FavoritesController (provider)
  screens/    home  search  product  stylist  photo_search  tryon  favorites  account
  widgets/    common.dart             product card/grid, loading / error / empty states
test/         core_test.dart          models, ApiClient (mock HTTP), config, auth, favourites, validators
              app_test.dart           the whole app against a fake API: navigation, search, stylist, sign-in, photo search, try-on polling
```

## Tests

```bash
flutter analyze
flutter test        # 43 tests
```

Widget tests drive the real screens against a fake API, so they need no server, network or platform plugins.
Fonts (Cormorant Garamond, Inter) are fetched from Google Fonts on first use and cached on the device; tests and offline-only builds switch that off (`AuraFonts.enabled = false`).

## Known limits

- Sign-in tokens are stored in `shared_preferences` (plain local storage). For a production release move them to the platform keychain (`flutter_secure_storage`).
- No push notifications and no offline catalog: every screen needs the API.
- Photo search and try-on use the device gallery / camera through `image_picker`. Camera capture on the web falls back to a file chooser.
- Not yet run on a physical iOS device (no Mac here). Android and web were exercised; see the screenshots in the main README.
