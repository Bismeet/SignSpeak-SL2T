'use client';

/**
 * Limitations page (NFR-07, docs/ui-ux-specification.md §3.9).
 *
 * The supported-sign and supported-phrase lists are **generated from the real data files**
 * (`data/sign-vocabulary.json` and `data/phrases.json`), not written by hand. That is
 * deliberate: a hand-written list drifts from the app, and a stale limitations page is
 * worse than no limitations page at all.
 */

import { Badge } from '@/components/ui/Badge';
import { Callout } from '@/components/ui/Callout';
import { Icon } from '@/components/ui/Icon';
import { Card, Panel, SectionHeading, Stack } from '@/components/ui/Surface';
import { availabilitySummary, useModel } from '@/lib/state/model-provider';
import { PHRASE_CATEGORY_META, phraseSummary, visiblePhrases } from '@/lib/phrases/data';
import { SIGN_VOCABULARY, signVocabularySummary } from '@/lib/signs/vocabulary';
import { config } from '@/lib/config';

const CANNOT_DO = [
  'Translate sign language. It recognises a small published vocabulary of hospital signs, one sign at a time.',
  'Understand continuous signing or full sentences. Sentence-level segmentation is future work.',
  'Recognise fingerspelling. ISL fingerspelling is largely two-handed, and two-handed contact is hard for a single camera.',
  'See facial expression, which carries grammar in ISL. Only hands and shoulders are used.',
  'Work for every signer equally. Accuracy will vary with hand size, skin tone under poor lighting, camera angle, and regional sign variation.',
  'Guarantee correct recognition. It rejects uncertain signs instead of guessing, but it can still be wrong — confirm anything important.',
  'Diagnose, triage, or recommend treatment. It is not a medical device.',
  'Replace a qualified ISL interpreter or emergency services.',
  'Show an ISL video for a phrase no signer has verified. It shows the text and says so instead.',
  'Assemble English word clips and present them as ISL. That would produce English word order, not ISL grammar.',
  'Use ASL, or any sign language other than Indian Sign Language.',
  'Store your conversation or keep a history. Nothing is stored.',
];

export default function LimitationsPage() {
  const { availability } = useModel();
  const modelSummary = availabilitySummary(availability);
  const signs = signVocabularySummary();
  const phrases = phraseSummary();
  const verifiedPhrases = visiblePhrases(false);
  const allPhrases = visiblePhrases(true);

  return (
    <div className="mx-auto w-full max-w-4xl px-3 py-6 sm:px-5 sm:px-5 py-8">
      <SectionHeading
        level={1}
        title="Limitations"
        description="Exactly what this build can and cannot do. This page is generated from the app’s own data, so it cannot drift out of date."
        icon="alert"
      />

      <Stack gap="lg" className="mt-5">
        <Callout tone="warning" icon="alert" title="Read this before relying on SignSpeak">
          This is a research prototype for a small set of hospital and emergency situations. It is a
          communication aid, not a medical device and not an interpreter. If a message matters, get a
          human to confirm it.
        </Callout>

        {/* Model status */}
        <section aria-labelledby="model-heading">
          <Card elevation="flat">
            <Panel padding="md" className="space-y-4">
              <SectionHeading id="model-heading" level={2} title="Sign recognition model" icon="hand" />

              <Badge tone={modelSummary.tone === 'neutral' ? 'neutral' : modelSummary.tone} icon="info">
                {modelSummary.label}
              </Badge>
              {modelSummary.detail ? <p className="text-pretty text-muted">{modelSummary.detail}</p> : null}

              {availability.state === 'ready' ? (
                <div className="space-y-4">
                  <dl className="grid gap-x-6 gap-y-2 rounded-2xl bg-raised p-4 text-sm sm:grid-cols-2">
                    <div className="flex gap-2">
                      <dt className="font-semibold text-muted">Recognises</dt>
                      <dd>{availability.card.vocabulary.length} signs</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="font-semibold text-muted">Trained on</dt>
                      <dd>{availability.card.dataset.sampleCount} samples</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="font-semibold text-muted">Signers</dt>
                      <dd>{availability.card.dataset.signerCount}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="font-semibold text-muted">Held-out-signer macro F1</dt>
                      <dd>
                        {availability.card.metrics?.heldOutSignerMacroF1 === null ||
                        availability.card.metrics?.heldOutSignerMacroF1 === undefined
                          ? 'Not measured'
                          : availability.card.metrics.heldOutSignerMacroF1.toFixed(3)}
                      </dd>
                    </div>
                  </dl>

                  {availability.card.notForRealUse ? (
                    <Callout tone="danger" icon="alert" title="These predictions are not real sign recognition" assertive>
                      {availability.card.disclaimer ??
                        'This model was trained on procedurally generated data to verify that the pipeline works end to end. It has never seen a real ISL sign, so it must not be presented as a working recogniser.'}
                    </Callout>
                  ) : null}

                  {availability.card.limitations.length > 0 ? (
                    <div>
                      <h3 className="font-semibold">Stated by the model card</h3>
                      <ul className="mt-2 space-y-1.5">
                        {availability.card.limitations.map((limitation) => (
                          <li key={limitation} className="flex gap-2.5 text-pretty text-muted">
                            <Icon name="alert" size="1rem" className="mt-1.5 shrink-0 text-warning" />
                            <span>{limitation}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-2xl bg-raised p-4">
                  <h3 className="font-semibold">Why there is no model in this build</h3>
                  <p className="mt-1.5 text-pretty text-muted">
                    A recognition model can only be trained on landmark data collected from real ISL
                    signers, with their consent. That data does not exist yet. Rather than ship a
                    model trained on invented data and present its guesses as recognition, this build
                    ships the complete pipeline — data collection tool, feature extraction, training,
                    evaluation, ONNX export and browser inference — and states plainly that the model
                    is missing.
                  </p>
                  <p className="mt-2 text-pretty text-muted">
                    The phrase board, Emergency mode, typing, speech-to-text and text-to-speech do not
                    depend on the model and work fully.
                  </p>
                </div>
              )}
            </Panel>
          </Card>
        </section>

        {/* Vocabulary status */}
        <section aria-labelledby="vocabulary-heading">
          <Card elevation="flat">
            <Panel padding="md" className="space-y-4">
              <SectionHeading
                id="vocabulary-heading"
                level={2}
                title="The candidate vocabulary"
                icon="list"
                description="The signs the project plans to support. None has been confirmed by an ISL signer yet."
              />

              <div className="flex flex-wrap gap-2">
                <Badge tone="neutral" icon="list">{signs.total} candidate signs</Badge>
                <Badge tone="neutral" icon="badge-check">{signs.must} at Must tier</Badge>
                <Badge tone={signs.verified === 0 ? 'warning' : 'success'} icon="alert">
                  {signs.verified} confirmed by an ISL signer
                </Badge>
                <Badge tone="warning" icon="question">
                  {signs.unknownMotion} with unknown static/dynamic status
                </Badge>
              </div>

              <Callout tone="warning" icon="alert" title="Nothing here is confirmed yet">
                Every sign is marked <strong>unverified</strong>. Until an ISL signer checks each form
                against the ISLRTC dictionary, the project cannot claim these are the correct ISL
                signs, and no data should be collected for them. This is the single largest open
                dependency in the project.
              </Callout>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                  <caption className="sr-only">Candidate signs, tier, motion and verification status</caption>
                  <thead>
                    <tr className="border-b border-line">
                      <th scope="col" className="py-2 pe-3 font-semibold">Sign</th>
                      <th scope="col" className="py-2 pe-3 font-semibold">Hindi</th>
                      <th scope="col" className="py-2 pe-3 font-semibold">Tier</th>
                      <th scope="col" className="py-2 pe-3 font-semibold">Static or dynamic</th>
                      <th scope="col" className="py-2 font-semibold">Verification</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SIGN_VOCABULARY.map((sign) => (
                      <tr key={sign.gloss} className="border-b border-line last:border-0">
                        <th scope="row" className="py-2.5 pe-3 align-top font-medium">
                          {sign.label}
                          <span className="ms-1.5 font-mono text-xs text-faint">{sign.gloss}</span>
                        </th>
                        <td className="py-2.5 pe-3 align-top text-muted" lang="hi">{sign.labelHi || '—'}</td>
                        <td className="py-2.5 pe-3 align-top">
                          <Badge tone={sign.tier === 'must' ? 'primary' : 'neutral'}>
                            {sign.tier === 'must' ? 'Must' : 'Should'}
                          </Badge>
                        </td>
                        <td className="py-2.5 pe-3 align-top text-muted">
                          {sign.motion === 'unverified' ? 'Not confirmed' : sign.motion}
                        </td>
                        <td className="py-2.5 align-top">
                          <Badge tone={sign.verification === 'expert_verified' ? 'success' : 'warning'} icon="alert">
                            {sign.verification === 'expert_verified' ? 'Verified' : 'Unverified'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {SIGN_VOCABULARY.some((sign) => sign.notes) ? (
                <div className="rounded-2xl bg-raised p-4">
                  <h3 className="font-semibold">Expert notes still needed</h3>
                  <ul className="mt-2 space-y-2 text-sm">
                    {SIGN_VOCABULARY.filter((sign) => sign.notes).map((sign) => (
                      <li key={sign.gloss} className="text-pretty text-muted">
                        <span className="font-medium text-ink">{sign.label}: </span>
                        {sign.notes}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Panel>
          </Card>
        </section>

        {/* Phrases */}
        <section aria-labelledby="phrases-heading">
          <Card elevation="flat">
            <Panel padding="md" className="space-y-4">
              <SectionHeading
                id="phrases-heading"
                level={2}
                title="The phrase list"
                icon="video"
                description="Every phrase the matcher can recognise, and its verification state."
              />

              <div className="flex flex-wrap gap-2">
                <Badge tone="neutral" icon="list">{phrases.total} phrases</Badge>
                <Badge tone="neutral" icon="list">{phrases.categories} categories</Badge>
                <Badge tone={phrases.verified === 0 ? 'warning' : 'success'} icon="badge-check">
                  {phrases.verified} verified by an ISL signer
                </Badge>
                <Badge tone={phrases.withClip === 0 ? 'warning' : 'success'} icon="video">
                  {phrases.withClip} with a verified ISL video
                </Badge>
              </div>

              {phrases.withClip === 0 ? (
                <Callout tone="warning" icon="alert" title="No verified ISL video exists in this build">
                  You will see “No verified ISL video for this phrase” whenever a hearing user’s
                  message matches one of these phrases. That is the correct, honest behaviour: a video
                  may only be shown once a qualified ISL signer has reviewed and approved it, and that
                  review has not happened yet.
                </Callout>
              ) : null}

              <div className="space-y-4">
                {PHRASE_CATEGORY_META.map((meta) => {
                  const inCategory = allPhrases.filter((phrase) => phrase.category === meta.category);
                  if (inCategory.length === 0) return null;
                  return (
                    <div key={meta.category}>
                      <h3 className="font-semibold">
                        {meta.label}{' '}
                        <span className="font-normal text-muted">({inCategory.length})</span>
                      </h3>
                      <ul className="mt-2 space-y-1.5">
                        {inCategory.map((phrase) => (
                          <li key={phrase.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <Icon
                              name={phrase.validation.status === 'expert_verified' ? 'badge-check' : 'alert'}
                              size="1rem"
                              className={phrase.validation.status === 'expert_verified' ? 'text-success' : 'text-warning'}
                            />
                            <span className="font-medium">{phrase.textEn}</span>
                            {phrase.textHi ? (
                              <span className="text-muted" lang="hi">
                                · {phrase.textHi}
                              </span>
                            ) : null}
                            <span className="text-sm text-faint">
                              {phrase.validation.status === 'expert_verified' ? 'verified' : 'draft'}
                              {phrase.clip.type !== 'none' ? ' · has a clip' : ' · no clip'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>

              <p className="text-sm text-muted">
                Phrases currently visible without turning on “Show unverified phrases”:{' '}
                {verifiedPhrases.length}.
              </p>
            </Panel>
          </Card>
        </section>

        {/* What it cannot do */}
        <section aria-labelledby="cannot-heading">
          <Card elevation="flat">
            <Panel padding="md" className="space-y-4">
              <SectionHeading id="cannot-heading" level={2} title="What SignSpeak cannot do" icon="x" />
              <ul className="grid gap-2.5">
                {CANNOT_DO.map((item) => (
                  <li key={item} className="flex gap-2.5 text-pretty">
                    <Icon name="x" size="1.15rem" className="mt-1 shrink-0 text-danger" />
                    <span className="text-muted">{item}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </Card>
        </section>

        {/* Verification policy */}
        <section aria-labelledby="policy-heading">
          <Card elevation="flat">
            <Panel padding="md" className="space-y-4">
              <SectionHeading
                id="policy-heading"
                level={2}
                title="How content gets verified"
                icon="badge-check"
              />
              <ol className="space-y-3">
                {[
                  {
                    title: 'Written, not signed, is not enough',
                    body: 'A phrase can be drafted by anyone, but it only becomes expert_verified when a named qualified ISL signer confirms that the signed form is correct, natural, and appropriate for a clinical setting.',
                  },
                  {
                    title: 'Every clip records who verified it and when',
                    body: 'Each phrase stores the verifier’s name, the verification date and the licence of the clip. A phrase marked verified must have a clip — the data validator fails the build if it does not.',
                  },
                  {
                    title: 'Drafts are hidden by default',
                    body: 'Unverified phrases do not appear in the phrase board or Emergency mode unless you explicitly turn them on, and they always carry a visible UNVERIFIED badge. They are never described as ISL.',
                  },
                  {
                    title: 'A clip can be withdrawn without a code change',
                    body: 'Setting a phrase’s status to rejected or unverified in the phrase file removes it from the default view immediately.',
                  },
                ].map((step, index) => (
                  <li key={step.title} className="flex gap-3">
                    <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary">
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-semibold">{step.title}</p>
                      <p className="text-pretty text-muted">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Panel>
          </Card>
        </section>

        {/* Credits */}
        <section aria-labelledby="credits-heading">
          <Card elevation="flat">
            <Panel padding="md" className="space-y-3">
              <SectionHeading id="credits-heading" level={2} title="Credits and acknowledgements" icon="users" />
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="font-semibold">ISL verifiers</dt>
                  <dd className="text-muted">
                    None yet. No phrase or sign in this build has been verified by a qualified ISL
                    signer, which is why no content carries a verified badge.
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold">Sign language reference</dt>
                  <dd className="text-muted">
                    The Indian Sign Language Research and Training Centre (ISLRTC) dictionary is the
                    intended reference for canonical sign forms. SignSpeak does not currently embed or
                    redistribute any ISLRTC material; reuse terms still need to be confirmed.
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold">Hand and pose tracking</dt>
                  <dd className="text-muted">
                    MediaPipe Tasks Vision, running on your device. MediaPipe locates hands and body
                    joints; it does not recognise sign language. All sign recognition is the project’s
                    own model.
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold">Prior work</dt>
                  <dd className="text-muted">
                    SignSpeak builds on published ISL research and community resources, including the
                    INCLUDE dataset and AI4Bharat’s ISL work at IIT Madras, the CISLR and iSign
                    benchmarks, and ISLRTC’s dictionary and Sign Learn app. It does not claim novelty
                    over any of them.
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold">Standards followed</dt>
                  <dd className="text-muted">
                    WCAG 2.2 Level AA, the WAI-ARIA Authoring Practices, and the Guidelines for Indian
                    Government Websites.
                  </dd>
                </div>
              </dl>
            </Panel>
          </Card>
        </section>

        <Callout tone="warning" icon="alert" title="Emergency">
          SignSpeak does not call anyone and does not assess how serious a condition is. In an
          emergency, call {config.emergencyNumber} and get staff.
        </Callout>
      </Stack>
    </div>
  );
}
