import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'AuraFit — Pakistani Fashion Stylist',
  description: 'Discover premium Pakistani fashion from Khaadi, Beechtree, Limelight & more. AI-powered outfit recommendations tailored to your style.',
  keywords: 'Pakistani fashion, AI stylist, Khaadi, Beechtree, Limelight, outfit recommendations, lawn suits, Pakistani brands',
  openGraph: {
    title: 'AuraFit — Pakistani Fashion Stylist',
    description: 'AI-powered outfit recommendations from top Pakistani brands',
    type: 'website'
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        {children}
      </body>
    </html>
  );
}
