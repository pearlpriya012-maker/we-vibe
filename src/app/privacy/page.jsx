// src/app/privacy/page.jsx
import Link from 'next/link'

export const metadata = {
  title: 'Privacy Policy — WE🕊️',
  description: 'Privacy policy for WE🕊️ collaborative music rooms.',
}

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'Work Sans, sans-serif' }}>
      <div className="grid-bg" />

      {/* Nav */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 48px', backdropFilter: 'blur(20px)', background: 'rgba(13,13,13,0.85)', borderBottom: '1px solid var(--border)' }}>
        <Link href="/" style={{ fontFamily: 'Oswald', fontSize: '1.3rem', fontWeight: 700, color: 'var(--green)', textDecoration: 'none', letterSpacing: '0.1em', textShadow: '0 0 20px rgba(0,255,136,0.4)' }}>WE🕊️</Link>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: '0.85rem' }}>← Back to Home</Link>
      </nav>

      {/* Content */}
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '60px 32px 100px', position: 'relative', zIndex: 1 }}>
        <h1 style={{ fontFamily: 'Oswald', fontSize: '2.2rem', fontWeight: 700, color: 'var(--green)', marginBottom: 8, letterSpacing: '0.06em' }}>Privacy Policy</h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: 48 }}>Last updated: April 7, 2026</p>

        {[
          {
            title: '1. Overview',
            body: 'WE🕊️ ("we", "us", "our") is a real-time collaborative music room application. This Privacy Policy explains how we collect, use, and protect your information when you use our service at https://we-vibe-five.vercel.app.'
          },
          {
            title: '2. Information We Collect',
            body: 'We collect the following information:\n• Email address and display name — when you create an account via email/password or Google sign-in.\n• YouTube account data — only when you explicitly choose to link your YouTube account. We access your YouTube playlists solely to display them within the app for playback.\n• Room activity — messages, queue additions, and playback events are stored temporarily in Firestore to enable real-time sync between room participants.'
          },
          {
            title: '3. How We Use Your Information',
            body: 'We use your information only to:\n• Authenticate you and maintain your session.\n• Display your YouTube playlists inside music rooms you create or join.\n• Sync music playback and chat in real-time with other room participants.\n\nWe do NOT sell, rent, or share your personal data with any third parties.'
          },
          {
            title: '4. YouTube Data',
            body: 'When you link your YouTube account, we request read-only access to your YouTube playlists (youtube.readonly scope). This data is:\n• Used only to display and play your playlists within WE🕊️.\n• Never stored permanently on our servers.\n• Never shared with other users or third parties.\n\nYou can revoke YouTube access at any time at https://myaccount.google.com/permissions.'
          },
          {
            title: '5. Data Storage',
            body: 'User accounts and room data are stored in Google Firebase Firestore. Firebase is operated by Google and subject to Google\'s privacy policy. We store only what is necessary for the app to function.'
          },
          {
            title: '6. Data Retention',
            body: 'You may delete your account at any time from the Settings page. Upon deletion, your account data and any associated room data is permanently removed from our systems.'
          },
          {
            title: '7. Cookies',
            body: 'We use Firebase Authentication which stores a session token in your browser\'s local storage to keep you logged in. We do not use third-party advertising or tracking cookies.'
          },
          {
            title: '8. Children\'s Privacy',
            body: 'WE🕊️ is not directed at children under 13. We do not knowingly collect personal information from children under 13.'
          },
          {
            title: '9. Changes to This Policy',
            body: 'We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated date.'
          },
          {
            title: '10. Contact',
            body: 'If you have any questions about this Privacy Policy, please contact us at the email associated with your WE🕊️ account or through the app\'s support channel.'
          },
        ].map(({ title, body }) => (
          <section key={title} style={{ marginBottom: 40 }}>
            <h2 style={{ fontFamily: 'Oswald', fontSize: '1.1rem', fontWeight: 600, color: 'var(--cyan)', marginBottom: 12, letterSpacing: '0.04em' }}>{title}</h2>
            <p style={{ color: 'rgba(255,255,255,0.75)', lineHeight: 1.8, fontSize: '0.92rem', whiteSpace: 'pre-line' }}>{body}</p>
          </section>
        ))}

        <div style={{ marginTop: 60, padding: '24px 28px', background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.15)', borderRadius: 12 }}>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem', margin: 0 }}>
            This app uses YouTube API Services. By using WE🕊️, you also agree to{' '}
            <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--green)' }}>YouTube's Terms of Service</a>{' '}
            and{' '}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--green)' }}>Google's Privacy Policy</a>.
          </p>
        </div>
      </div>
    </div>
  )
}
