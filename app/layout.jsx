import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';

export const metadata = {
  title: 'JobIntel — live LinkedIn job intelligence',
  description:
    'Search live LinkedIn job postings by keyword, location, seniority and remote policy. Streaming results, full job detail, CSV export.',
  applicationName: 'JobIntel',
  openGraph: {
    title: 'JobIntel',
    description: 'Live LinkedIn job intelligence — stream a search and read the postings in seconds.',
    type: 'website',
  },
};

export const viewport = {
  themeColor: '#fbfbfd',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
