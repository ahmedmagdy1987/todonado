import { LegalLayout, LegalSection, LEGAL_CONTACT } from './LegalLayout'

export function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Use"
      intro={
        <p>
          These Terms of Use govern your access to and use of Todonado. By using the app, you agree
          to these terms. They are a starting template. Please review them with your own legal
          advisor before relying on them.
        </p>
      }
    >
      <LegalSection heading="Your account">
        <p>
          You are responsible for the activity on your account and for keeping your credentials and
          email access secure, since you can sign in with a password or with a magic link sent to
          your address. Please let us know promptly if you believe your account has been accessed
          without your permission.
        </p>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>
          Please use Todonado lawfully and respectfully. Do not misuse the service, attempt to
          disrupt or reverse-engineer it, access data that is not yours, or use it to store or
          distribute unlawful content.
        </p>
      </LegalSection>

      <LegalSection heading="The service is provided as is">
        <p>
          Todonado is offered on an as-is and as-available basis, without warranties of any kind. As
          an evolving product, features may change and the service may occasionally be unavailable.
          We do not guarantee that it will be error-free or uninterrupted.
        </p>
      </LegalSection>

      <LegalSection heading="Limitation of liability">
        <p>
          To the maximum extent permitted by law, Todonado and its operators are not liable for any
          indirect, incidental, or consequential damages, or for any loss of data or profits arising
          from your use of the service.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to these terms">
        <p>
          We may update these terms from time to time. When we do, we will update the date shown at
          the top of this page. Your continued use of Todonado after changes take effect means you
          accept the revised terms.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          If you have questions about these terms, contact us at{' '}
          <span className="text-text-primary">{LEGAL_CONTACT}</span>.
        </p>
      </LegalSection>
    </LegalLayout>
  )
}
