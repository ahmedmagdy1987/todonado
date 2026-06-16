import { LegalLayout, LegalSection, LEGAL_CONTACT } from './LegalLayout'

export function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      intro={
        <p>
          This Privacy Policy explains what information Todonado collects, how we use it, and the
          choices you have. It is a starting template. Please review it with your own legal advisor
          before relying on it.
        </p>
      }
    >
      <LegalSection heading="Information we collect">
        <p>
          <strong className="text-text-primary">Account information.</strong> When you create an
          account or sign in, we collect your email address. You can sign in with a password or with
          a passwordless magic link sent to your email. If you set a password, it is handled and
          stored securely by our authentication provider.
        </p>
        <p>
          <strong className="text-text-primary">Your content and usage.</strong> We store the
          tasks, projects, sections, focus sessions, and planning data you create so the app can
          save and sync them across your devices. This data is held with our database and hosting
          provider.
        </p>
      </LegalSection>

      <LegalSection heading="How we use your information">
        <p>
          We use your information to provide and operate Todonado: to authenticate you, sync your
          tasks and plans, power the capacity meter and focus features, and keep the service
          running. We do not sell your personal information.
        </p>
      </LegalSection>

      <LegalSection heading="Storage and security">
        <p>
          Your data is stored with our infrastructure provider and protected by row-level security
          rules so that you can only access your own records. No method of transmission or storage
          is perfectly secure, but we take reasonable measures to protect your information.
        </p>
      </LegalSection>

      <LegalSection heading="Cookies and local storage">
        <p>
          We use cookies and browser local storage to keep you signed in and to remember your
          preferences. These are necessary for the app to work as intended.
        </p>
      </LegalSection>

      <LegalSection heading="Data export and deletion">
        <p>
          You can request a copy of your data, or ask us to delete your account and the data
          associated with it, at any time. To make a request, contact us at{' '}
          <span className="text-text-primary">{LEGAL_CONTACT}</span>.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to this policy">
        <p>
          We may update this Privacy Policy from time to time. When we do, we will update the date
          shown at the top of this page. We encourage you to review it periodically.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          If you have questions about this policy or how your data is handled, contact us at{' '}
          <span className="text-text-primary">{LEGAL_CONTACT}</span>.
        </p>
      </LegalSection>
    </LegalLayout>
  )
}
