// src/app/layout.jsx
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from '@/context/AuthContext'
import '@/styles/globals.css'

export const metadata = {
  title: 'WE🕊️ — Collaborative Music Rooms',
  description: 'Watch. Listen. Together — in perfect sync.',
  verification: {
    google: '4zU7j5shCTlBlrC-Vi_8WB9feBvgAwiy3QXbeIUK34o',
  },
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
  openGraph: {
    title: 'WE🕊️',
    description: 'Real-time collaborative music rooms powered by YouTube & AI.',
    type: 'website',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Work+Sans:ital,wght@0,300;0,400;0,500;0,600;1,300&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuthProvider>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: '#111',
                color: '#e8e8e8',
                border: '1px solid rgba(0,255,136,0.2)',
                fontFamily: "'Work Sans', sans-serif",
                fontSize: '0.9rem',
              },
              success: {
                iconTheme: { primary: '#00ff88', secondary: '#000' },
              },
              error: {
                iconTheme: { primary: '#e91e63', secondary: '#fff' },
              },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  )
}
