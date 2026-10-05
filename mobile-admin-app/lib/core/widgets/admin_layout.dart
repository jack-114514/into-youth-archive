import 'package:flutter/material.dart';

/// Keeps forms readable on tablets without squeezing the phone layout.
class AdminPageWidth extends StatelessWidget {
  const AdminPageWidth({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.topCenter,
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 960),
      child: SizedBox(width: double.infinity, child: child),
    ),
  );
}

class AdminFormSection extends StatelessWidget {
  const AdminFormSection({
    super.key,
    required this.title,
    required this.children,
    this.description,
  });
  final String title;
  final String? description;
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.only(bottom: 16),
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            style: Theme.of(context).textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          if (description != null) ...[
            const SizedBox(height: 6),
            Text(description!, style: Theme.of(context).textTheme.bodySmall),
          ],
          const SizedBox(height: 20),
          ...children,
        ],
      ),
    ),
  );
}
