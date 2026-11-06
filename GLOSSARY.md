# Winnonah

The practice's EMR: tracks clients through intake, appointments, insurance, questionnaires, and reports.

## Language

### People

**Company head**:
The head of the company, who is the default owner of many tasks, including every reactivation **Admin review**.
_Avoid_: Admin

### Issues

**Issue**:
A kind of problem that staff need to fix, shown on the issues page as a list of every client that currently has it. Three clients with a Just added questionnaire are one issue with three clients on it.
_Avoid_: Alert, flag

**Battery**:
The full set of questionnaire types a client needs before a DA or EVAL. A partial battery is an issue: some but not all of the required types have been sent.

**DDS request**:
A Disability Determination Services fax naming a client, waiting for staff to approve or deny sending that client's psychological evaluation.

**Charter school client**:
A client whose intake says they attend a charter school. Charter school clients sign the charter school release of information forms, and records requests wait until staff confirm the charter school answer. Only charter schools are tracked, not private schools generally.
_Avoid_: Private school client

**Special accommodations notice**:
An email sent once per client to the South Carolina Department of Health and Human Services (SCDHHS) when a non-English Medicaid or BabyNet client gets a newly scheduled appointment, so an interpreter can be arranged. Staff approve or deny it from the issues page.
_Avoid_: Interpreter email

**Failure**:
A recorded reason a client is stuck before a DA, EVAL, DAEVAL or records step, such as "docs not signed", "portal not opened" or "too young for ASD". A client with two different reasons has two failures. A failure is rechecked automatically and resolved once its cause is fixed, for example when the client signs their docs or opens the portal. Families are reminded about the ones they can fix until then.
_Avoid_: Error, blocker

**Client-fixable failure**:
A failure the client (or the passage of time) can fix, such as "docs not signed" or "too young for ASD". Staff may need to nudge the client, and the failure clears once the cause is fixed. Also called a retryable or self-clearing failure.

**Staff-fixable failure**:
A failure that will not clear without a staff member stepping in. Any failure with an unknown reason, such as a long browser automation error, counts as this by default. Also called an unresolvable or needs-staff failure.

### Records

**Records**:
A client's school records, requested from their school or district to support the DA or EVAL. Other kinds of records are not meant by this word.
_Avoid_: Medical records, prior evaluations

**Records needed**:
A client marker meaning their school records must be requested. It is set by staff and cleared at a session reset so staff re-triage it.

**Unreviewed or unreceived records**:
An issue listing clients whose records are needed and were requested, but nothing has come back or been reviewed within three weekdays of the latest request. A school's reply counts as reviewed only after a staff member reads it and marks it.

### Appointments

**DA**:
A diagnostic assessment appointment.
_Avoid_: Diagnostic

**EVAL**:
The longer evaluation appointment.
_Avoid_: Evaluation

**DAEVAL**:
A single appointment that covers both the DA and the EVAL, which some insurances allow.

### Insurance

**Precert**:
The insurer's prior authorization for a client's care, tracked as a single expiration date rather than a count of visits.
Staff also call it "prior auth" or "pre-auth"; all three mean the same thing.

### Questionnaires

**Questionnaire**:
A form assigned to a client's family to complete, tracked through statuses from pending to completed.

**Ignoring**:
A questionnaire status meaning the family must be left alone, for example after a death in the family. Automated reminders must not contact them.

**Responded**:
A questionnaire status meaning the family has replied to our automated messages in any way.

**Spanish**:
A questionnaire status meaning the Spanish version was sent to the family.

**Language**:
A questionnaire status meaning a version in a language other than English or Spanish (for example Chinese or Portuguese) was sent.

**Teacher**:
A questionnaire status for questionnaires sent to a teacher instead of the family.

**External**:
A questionnaire status for questionnaires we did not send but have access to, for example from a school.

**Archived**:
A questionnaire status for one staff treat as deleted. Data is never actually deleted.

**Just added**:
A questionnaire status for one created on the site but not yet messaged to the client. It is a half-finished state that questionnaires should not stay in, so any client with one appears on the issues page.

**Post-DA pending / Post-eval pending**:
Questionnaire statuses for work still owed after a diagnostic assessment (DA) or an evaluation (EVAL) appointment. It covers questionnaires left unfinished before the appointment, and follow-up questionnaires sent afterward for additional information.

### Client lifecycle

**Notes-only client**:
A record made for someone we might see, such as a person who reached out but has no referral yet. It holds notes only and is not a real client until they are onboarded.
_Avoid_: Placeholder, lead

**Active / Inactive**:
A client's status as set in TherapyAppointment (TA) and picked up by the TA import. Our own appointment history never decides it. The 12-month gap behind **Reactivation** runs from the moment TA marks the client Inactive.

**Session**:
One continuous period of care for a client, from intake until they have been gone 12 or more months. Each gap is measured on its own, so a client who returns after several shorter gaps stays in the same session.
_Avoid_: Episode, case

**Reactivation**:
A client returning to Active status less than 12 months after going Inactive. It stays within the same session and triggers an **Admin review**.
_Avoid_: Reopen, return

**Admin review**:
A long-running discussion between staff members to iron out a client's issues, such as insurance, when sorting it out is more than one person's job. It is carried across a session reset, not archived. On reactivation it is enabled and assigned to the **Company head**.
_Avoid_: Insurance review

**Session reset**:
What happens when a client returns after a gap of 12 or more months: prior-session data is archived and a new session begins.
_Avoid_: Full reset, new intake
