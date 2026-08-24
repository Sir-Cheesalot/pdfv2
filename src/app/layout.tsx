import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Splice PDF Studio',
  description: 'Clean, client-side PDF editor and document converter.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-[#f5f5f7] text-[#1d1d1f] antialiased overflow-hidden select-none">
        {children}
      </body>
    </html>
  );
}
