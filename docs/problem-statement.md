# Problem Statement

## The problem

Deaf and hard-of-hearing people in India who use Indian Sign Language (ISL) frequently face situations where the person they must communicate with does not sign. Hospitals and emergencies are the highest-stakes version of this problem: a patient needs to express pain location, symptoms, allergies, basic needs, or a request for help quickly and accurately, and staff need to ask questions and give instructions back.

Today the practical options are writing on paper or a phone, lip-reading, gesturing, relying on a family member, or waiting for an interpreter. Each has known problems:

- Writing assumes the patient is literate in the written language used by staff and is physically able to write, which is not guaranteed in an emergency.
- Lip-reading is unreliable, and became harder with masks.
- Family members may be unavailable, may not sign fluently, or may not be appropriate for private medical matters.
- Qualified ISL interpreters are scarce relative to demand and are rarely available on short notice in emergency settings.

## Evidence base

The following are the kinds of facts the project can lean on. Each must be re-verified against the live source before being quoted publicly.

- `FACT` The **Census of India 2011** recorded persons with disabilities by type; hearing disability was one of the largest categories, of the order of 5 million people. Source: Office of the Registrar General and Census Commissioner, India, Census 2011 disability tables (https://censusindia.gov.in/). Exact figure to be copied from the official table.
- `FACT` The **WHO** estimates that over 1.5 billion people worldwide live with some degree of hearing loss and projects growth to 2050. Source: WHO fact sheet "Deafness and hearing loss" (https://www.who.int/news-room/fact-sheets/detail/deafness-and-hearing-loss).
- `FACT` The **Rights of Persons with Disabilities Act, 2016** (India) places obligations on establishments to provide accessible communication and recognises the promotion of sign language. Source: Department of Empowerment of Persons with Disabilities (https://disabilityaffairs.gov.in/), Act text via https://legislative.gov.in/.
- `FACT` The **Indian Sign Language Research and Training Centre (ISLRTC)**, under the Ministry of Social Justice and Empowerment, publishes the official ISL dictionary (third edition around 10,000 terms, released 2021) and video resources. Source: https://islrtc.nic.in/.
- `FACT` Sign languages are complete natural languages with their own grammar; ISL is not a signed form of Hindi or English. Source: Zeshan, U. (2000), *Sign Language in Indo-Pakistan: A Description of a Signed Language*, John Benjamins; ISLRTC materials.

`ASSUMPTION` We have not found a published, India-specific count of interpreters per deaf person, or a study quantifying communication failures in Indian hospitals. We will **not** claim numbers on these until a source is found. The interpreter shortage is widely reported by disability organisations (for example, National Association of the Deaf, India) but should be cited as their statement, not as our finding.

## Who is affected

1. Deaf and hard-of-hearing ISL users seeking care.
2. Frontline healthcare staff (nurses, triage staff, doctors, receptionists) who do not sign.
3. Family members and companions who act as ad-hoc interpreters.
4. Emergency responders who need yes/no and location answers quickly.

See `user-personas-and-use-cases.md` for detailed personas.

## What SignSpeak proposes

A two-way communication aid that:

- Recognises a **small, verified set of hospital-relevant ISL signs** from a camera and turns them into text (and optional speech).
- Lets a hearing person **speak or type**, and shows the deaf user an **expert-verified ISL video** for that phrase when one exists, or clear text when it does not.
- Offers a **hospital/emergency phrase board** so that even when recognition fails, the deaf user can point, tap, or select what they need.
- Is **honest**: it shows confidence, refuses to guess on unsupported signs, and lets either party correct the record.

## What SignSpeak is not

- Not a universal sign-language translator. It recognises a curated vocabulary only.
- Not a diagnostic or clinical decision tool. It never suggests diagnoses or treatments.
- Not a replacement for qualified interpreters or emergency services. The UI states this on first launch and in the help screen.
- Not a continuous-signing system in the MVP. Signs are recognised one at a time.

## Success looks like

`PROPOSAL` For a hackathon prototype, success is: a deaf user can sign at least one supported sign, see it correctly transcribed with a confidence indicator, optionally have it spoken aloud, and receive a response from a hearing person that is displayed as a verified ISL clip, all within a few seconds per turn, with clear behaviour when something is not recognised. Measurable targets are defined in `testing-and-evaluation.md` and `mvp-scope.md`.
