import { LegalLayout, LegalSection, LEGAL_CONTACT } from './LegalLayout'

export function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      intro={
        <p>
          This Privacy Policy explains what information Todonado collects, how we use it, and the
          choices you have. It is written in plain language and describes what the app actually
          does. If anything here is unclear, ask us at{' '}
          <span className="text-text-primary">{LEGAL_CONTACT}</span> — you should not need a lawyer
          to understand what happens to your data.
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
          tasks, projects, sections, subtasks, focus sessions, templates, and planning data you
          create so the app can save and sync them across your devices. If you use the optional
          features, that also includes your journal entries, vision cards, mind maps, and the
          challenges you join. This data is held with our database and hosting provider.
        </p>
        <p>
          <strong className="text-text-primary">Voice recordings.</strong> If you record a voice
          note in the journal, the audio file is uploaded and stored in private cloud storage under
          a folder keyed to your account. Only you can play it back, through a short-lived link
          that expires. You can delete a recording, or the whole entry, at any time — and doing so
          deletes the file itself, not just the reference to it.
        </p>
        <p>
          <strong className="text-text-primary">Health-adjacent entries.</strong> The supplement
          and medication tracker and the quit tracker store what you type into them, which may
          describe your health or personal habits. These are personal logs kept for you: we do not
          analyse them, share them, aggregate them, or use them to build a profile of you. They are
          covered by the same access rules as the rest of your data, and they are included when you
          export or delete your account.
        </p>
        <p>
          <strong className="text-text-primary">Calendar.</strong> If you import a calendar, we
          store the busy time blocks needed for the capacity meter and, for a subscribed URL, the
          address you gave us so it can be refreshed.
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
          You do not need to ask us. Both are built into the app, in{' '}
          <strong className="text-text-primary">Settings</strong>:{' '}
          <strong className="text-text-primary">Export my data</strong> downloads your records as a
          JSON file, and <strong className="text-text-primary">Delete my account</strong> removes
          your account and everything attached to it: tasks, projects and sections, focus history,
          journal entries <em>and the voice recordings themselves</em>, quit-tracker habits and
          check-ins, vision goals, mind maps, challenges, personal templates, your supplement log,
          calendar sources, and your billing record. Deletion is immediate and cannot be undone, so
          export first if you want a copy.
        </p>
        <p>
          Two honest details. Recordings are deleted from storage <em>before</em> the account is
          removed — if that step fails, nothing is deleted and you are asked to try again, because
          the alternative would be telling you a recording is gone while it is still on our server.
          And the anonymous counters described above outlive the account by design: the row that
          records <em>&ldquo;someone completed a task&rdquo;</em> or{' '}
          <em>&ldquo;someone clicked upgrade&rdquo;</em> keeps its count but loses every link to
          you — the user id is cleared and any email address you typed into an interest form is
          erased in the same operation. What remains cannot be traced back to a person.
        </p>
        <p>
          One thing the export cannot contain: a JSON file cannot hold audio, so voice recordings
          are listed by name but not embedded. Download any recording you want to keep from the
          journal page before you delete your account. The export file says the same thing on its
          face.
        </p>
        <p>
          If either control does not work for you, or you want a copy in another format, contact us
          at <span className="text-text-primary">{LEGAL_CONTACT}</span>.
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
