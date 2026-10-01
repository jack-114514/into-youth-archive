import 'package:flutter/material.dart';

class AppTheme {
  const AppTheme._();

  static const ink = Color(0xFF082C2D);
  static const mint = Color(0xFFEAF3E9);
  static const acid = Color(0xFFC8FF5A);
  static const coral = Color(0xFFFF8C51);

  static ThemeData light() {
    final scheme = ColorScheme.fromSeed(
      seedColor: ink,
      brightness: Brightness.light,
      primary: ink,
      secondary: acid,
      surface: const Color(0xFFF7FAF4),
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: mint,
      fontFamily: 'sans-serif',
      textTheme: const TextTheme(
        headlineLarge: TextStyle(
          fontSize: 36,
          height: 1.08,
          fontWeight: FontWeight.w800,
          letterSpacing: -1.2,
          color: ink,
        ),
        headlineMedium: TextStyle(
          fontSize: 28,
          height: 1.12,
          fontWeight: FontWeight.w800,
          letterSpacing: -0.7,
          color: ink,
        ),
        titleLarge: TextStyle(fontWeight: FontWeight.w700, color: ink),
        bodyLarge: TextStyle(fontSize: 16, height: 1.55, color: ink),
        bodyMedium: TextStyle(fontSize: 14, height: 1.5, color: ink),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white.withValues(alpha: .78),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 15,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: ink.withValues(alpha: .12)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: ink.withValues(alpha: .12)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: ink, width: 1.5),
        ),
      ),
      cardTheme: CardThemeData(
        color: Colors.white.withValues(alpha: .72),
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(22),
          side: BorderSide(color: Colors.white.withValues(alpha: .9)),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(0, 52),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
        ),
      ),
    );
  }
}
