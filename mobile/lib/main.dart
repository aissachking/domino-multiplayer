import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'screens/home_screen.dart';
void main()=>runApp(const DominoApp());
class DominoApp extends StatelessWidget{const DominoApp({super.key});@override Widget build(BuildContext context)=>MaterialApp(title:'ضعيف جدا',debugShowCheckedModeBanner:false,locale:const Locale('ar'),supportedLocales:const[Locale('ar'),Locale('en'),Locale('fr')],localizationsDelegates:const[GlobalMaterialLocalizations.delegate,GlobalWidgetsLocalizations.delegate,GlobalCupertinoLocalizations.delegate],theme:ThemeData(useMaterial3:true,colorSchemeSeed:const Color(0xff4f46e5)),home:const HomeScreen());}
