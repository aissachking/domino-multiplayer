import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

import 'strings_ar.dart';
import 'strings_en.dart';
import 'strings_fr.dart';

/// App translations. Arabic is the default language; French and English are
/// selectable in Settings. All user-visible text goes through [t].
class S {
  S(this.locale) : _strings = tables[locale.languageCode] ?? stringsAr;

  final Locale locale;
  final Map<String, String> _strings;

  static const supportedLocales = [Locale('ar'), Locale('fr'), Locale('en')];
  static const Map<String, Map<String, String>> tables = {'ar': stringsAr, 'fr': stringsFr, 'en': stringsEn};

  static S of(BuildContext context) => Localizations.of<S>(context, S) ?? S(const Locale('ar'));

  static const LocalizationsDelegate<S> delegate = _SDelegate();

  bool get isRtl => locale.languageCode == 'ar';

  /// Looks up [key] and substitutes `{name}` placeholders from [args].
  String t(String key, [Map<String, Object?> args = const {}]) {
    var value = _strings[key] ?? stringsEn[key] ?? key;
    assert(() {
      if (!_strings.containsKey(key)) debugPrint('Missing translation "$key" for ${locale.languageCode}');
      return true;
    }());
    args.forEach((name, v) => value = value.replaceAll('{$name}', '$v'));
    return value;
  }

  /// Translates a server or engine error code.
  String error(String? code) {
    if (code == null) return t('err_generic');
    final key = 'err_$code';
    return _strings.containsKey(key) ? _strings[key]! : t('err_generic');
  }
}

class _SDelegate extends LocalizationsDelegate<S> {
  const _SDelegate();

  @override
  bool isSupported(Locale locale) => S.tables.containsKey(locale.languageCode);

  @override
  Future<S> load(Locale locale) => SynchronousFuture<S>(S(locale));

  @override
  bool shouldReload(_SDelegate old) => false;
}

extension LocalizationX on BuildContext {
  S get l10n => S.of(this);
}
