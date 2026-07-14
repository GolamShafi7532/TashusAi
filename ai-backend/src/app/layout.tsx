import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tashus AI Backend',
  description: 'Isolated AI ecosystem backend — not a user-facing app',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
