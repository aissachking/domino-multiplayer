import 'dart:math';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../ai/bot.dart';
import '../engine/models.dart';
import '../ui/widgets/tile_skins.dart';

/// Default backend address; override at build time with
/// `--dart-define=SERVER_URL=https://your-server` or later in Settings.
const String kDefaultServerUrl = String.fromEnvironment('SERVER_URL', defaultValue: 'https://daeef-jiddan-api.onrender.com');

/// Persistent player preferences (stored locally on the device).
class SettingsController extends ChangeNotifier {
  SettingsController(this._prefs) {
    _load();
  }

  final SharedPreferences _prefs;

  static Future<SettingsController> load() async => SettingsController(await SharedPreferences.getInstance());

  String _language = 'ar';
  String _skinId = TileSkin.defaultId;
  int _targetScore = 100;
  Difficulty _difficulty = Difficulty.normal;
  int _botCount = 1;
  bool _sound = true;
  bool _haptics = true;
  String _playerName = '';
  String _serverUrl = kDefaultServerUrl;
  late String _playerId;
  late String _token;

  Locale get locale => Locale(_language);
  String get language => _language;
  String get skinId => _skinId;
  TileSkin get skin => TileSkin.byId(_skinId);
  int get targetScore => _targetScore;
  Difficulty get difficulty => _difficulty;
  int get botCount => _botCount;
  bool get sound => _sound;
  bool get haptics => _haptics;
  String get playerName => _playerName;
  String get serverUrl => _serverUrl;
  String get playerId => _playerId;
  String get token => _token;

  void _load() {
    final lang = _prefs.getString('language');
    _language = const ['ar', 'fr', 'en'].contains(lang) ? lang! : 'ar';
    _skinId = TileSkin.byId(_prefs.getString('tileSkin')).id;
    final target = _prefs.getInt('targetScore');
    _targetScore = kTargetScores.contains(target) ? target! : 100;
    _difficulty = difficultyFromName(_prefs.getString('difficulty'));
    final bots = _prefs.getInt('botCount') ?? 1;
    _botCount = bots.clamp(1, 3).toInt();
    _sound = _prefs.getBool('sound') ?? true;
    _haptics = _prefs.getBool('haptics') ?? true;
    _playerName = _prefs.getString('playerName') ?? '';
    _serverUrl = _prefs.getString('serverUrl') ?? kDefaultServerUrl;
    _playerId = _prefs.getString('playerId') ?? '';
    _token = _prefs.getString('playerToken') ?? '';
    if (!RegExp(r'^[A-Za-z0-9_-]{8,64}$').hasMatch(_playerId) || !RegExp(r'^[A-Za-z0-9_-]{16,128}$').hasMatch(_token)) {
      _playerId = 'p_${_randomString(20)}';
      _token = _randomString(40);
      _prefs.setString('playerId', _playerId);
      _prefs.setString('playerToken', _token);
    }
  }

  static String _randomString(int length) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    final random = Random.secure();
    return List.generate(length, (_) => alphabet[random.nextInt(alphabet.length)]).join();
  }

  Future<void> setLanguage(String value) async {
    if (!const ['ar', 'fr', 'en'].contains(value)) return;
    _language = value;
    notifyListeners();
    await _prefs.setString('language', value);
  }

  Future<void> setSkin(String id) async {
    _skinId = TileSkin.byId(id).id;
    notifyListeners();
    await _prefs.setString('tileSkin', _skinId);
  }

  Future<void> setTargetScore(int value) async {
    if (!kTargetScores.contains(value)) return;
    _targetScore = value;
    notifyListeners();
    await _prefs.setInt('targetScore', value);
  }

  Future<void> setDifficulty(Difficulty value) async {
    _difficulty = value;
    notifyListeners();
    await _prefs.setString('difficulty', value.name);
  }

  Future<void> setBotCount(int value) async {
    _botCount = value.clamp(1, 3).toInt();
    notifyListeners();
    await _prefs.setInt('botCount', _botCount);
  }

  Future<void> setSound(bool value) async {
    _sound = value;
    notifyListeners();
    await _prefs.setBool('sound', value);
  }

  Future<void> setHaptics(bool value) async {
    _haptics = value;
    notifyListeners();
    await _prefs.setBool('haptics', value);
  }

  Future<void> setPlayerName(String value) async {
    _playerName = value.trim().length > 20 ? value.trim().substring(0, 20) : value.trim();
    notifyListeners();
    await _prefs.setString('playerName', _playerName);
  }

  Future<void> setServerUrl(String value) async {
    final url = value.trim();
    if (url.isEmpty) return;
    _serverUrl = url;
    notifyListeners();
    await _prefs.setString('serverUrl', url);
  }

  // ------------------------------------------------------------ offline save

  static const _saveKey = 'offline_save_v1';

  String? get savedGameJson => _prefs.getString(_saveKey);

  Future<void> writeSavedGame(String json) => _prefs.setString(_saveKey, json);

  Future<void> clearSavedGame() => _prefs.remove(_saveKey);
}

/// Makes the settings available to the widget tree.
class SettingsScope extends InheritedNotifier<SettingsController> {
  const SettingsScope({super.key, required SettingsController controller, required super.child})
      : super(notifier: controller);

  static SettingsController of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<SettingsScope>()!.notifier!;

  static SettingsController read(BuildContext context) =>
      context.getInheritedWidgetOfExactType<SettingsScope>()!.notifier!;
}
