import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

/// An API error with a message that is safe to show to the user.
class ApiException implements Exception {
  ApiException(this.message, {this.status, this.retryAfterSeconds});

  final String message;
  final int? status;
  final int? retryAfterSeconds;

  bool get isUnauthorized => status == 401;
  bool get isRateLimited => status == 429;

  @override
  String toString() => message;
}

/// Thin JSON-over-HTTP client for the AuraFit API.
///
/// The base URL and token are read through callbacks on every request, so changing the server in Settings
/// or signing in/out takes effect immediately without rebuilding anything.
class ApiClient {
  ApiClient({required this.baseUrl, required this.token, http.Client? client}) : _http = client ?? http.Client();

  final String Function() baseUrl;
  final String? Function() token;
  final http.Client _http;

  Uri _uri(String path, [Map<String, dynamic>? query]) {
    final clean = <String, String>{
      for (final e in (query ?? {}).entries)
        if (e.value != null && '${e.value}'.isNotEmpty) e.key: '${e.value}',
    };
    final base = Uri.parse('${baseUrl()}$path');
    return clean.isEmpty ? base : base.replace(queryParameters: clean);
  }

  Map<String, String> _headers({bool json = false}) => {
        'Accept': 'application/json',
        if (json) 'Content-Type': 'application/json',
        if (token() != null) 'Authorization': 'Bearer ${token()}',
      };

  Future<dynamic> get(String path, {Map<String, dynamic>? query, Duration timeout = const Duration(seconds: 30)}) {
    return _run(() => _http.get(_uri(path, query), headers: _headers()), timeout);
  }

  Future<dynamic> post(String path, {Object? body, Duration timeout = const Duration(seconds: 30)}) {
    return _run(() => _http.post(_uri(path), headers: _headers(json: true), body: body == null ? null : jsonEncode(body)), timeout);
  }

  Future<dynamic> postMultipart(
    String path, {
    Map<String, String> fields = const {},
    List<http.MultipartFile> files = const [],
    Duration timeout = const Duration(seconds: 90),
  }) {
    return _run(() async {
      final req = http.MultipartRequest('POST', _uri(path))
        ..headers.addAll(_headers())
        ..fields.addAll(fields)
        ..files.addAll(files);
      return http.Response.fromStream(await _http.send(req));
    }, timeout);
  }

  Future<dynamic> _run(Future<http.Response> Function() send, Duration timeout) async {
    final http.Response res;
    try {
      res = await send().timeout(timeout);
    } on TimeoutException {
      throw ApiException('The server took too long to answer. Please try again.');
    } on http.ClientException {
      throw ApiException('Cannot reach the server. Check your connection or the server address in Account → Server.');
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Cannot reach the server. Check your connection or the server address in Account → Server.');
    }
    return _decode(res);
  }

  dynamic _decode(http.Response res) {
    dynamic body;
    if (res.body.isNotEmpty) {
      try {
        body = jsonDecode(utf8.decode(res.bodyBytes));
      } catch (_) {
        body = null;
      }
    }
    if (res.statusCode >= 200 && res.statusCode < 300) return body;

    var message = 'Something went wrong (${res.statusCode}).';
    if (body is Map && body['error'] is String) message = body['error'] as String;
    if (res.statusCode == 429 && !(body is Map && body['error'] is String)) message = 'Too many requests. Please wait a moment.';
    if (res.statusCode == 503 && body is Map && body['error'] is String) message = body['error'] as String;
    final retry = int.tryParse(res.headers['retry-after'] ?? '') ?? (body is Map ? (body['retryAfterSeconds'] as num?)?.toInt() : null);
    throw ApiException(message, status: res.statusCode, retryAfterSeconds: retry);
  }

  void close() => _http.close();
}
