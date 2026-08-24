---
name: product-description
description: Write a "product description" repo for a software product — prose documents that describe, feature by feature and from the user's point of view, what the user sees, what they can do, and exactly what happens when they do it (including when they stop halfway), drafted from the code and tests, then checked against the running product. Use when asked to "write a product description for X", "document how X behaves for the user", or for a behavior spec rather than API docs.
---

# Product description

The product is a state chart the user moves through with input. Describe it feature by feature, in plain language, from the outside in, with the same skeleton for every document so gaps show up by comparison. Draft from code and tests; verify against the running product; collect what looks wrong into one triage file.

## Repo layout

```
README.md         purpose, scope decisions, the skeleton, the structure (every planned document with a one-line gloss), and a coverage table (not started / drafted / verified)
goal.md           the standing prompt for whoever drafts: source repo path and commit, reading order, writing rules, established facts, order of work
glossary.md       one paragraph per term of art; the source of truth for every word
AGENTS.md         "Read README.md, then goal.md. The coverage table in README.md is the work list."  (CLAUDE.md: "Read @AGENTS.md.")
<area>/<feature>.md   one document per feature, grouped by how the user meets it, never by package
verification/     README.md (how to run a pass) + one checklist file per cluster of documents
bug-triage.md     every suspected defect, deduplicated by root cause
```

## Method

**1. Scope.** Settle with the user, or infer: the product and the one surface being described (route, role, config; usually the defaults); the source repo path and commit (read-only; every document footer cites it); how to run it; what is out of scope and why. Then decide the four things that shape every document, and write them into the README before the pilot:

- *The unit of interaction* and its five phases: starting, ending at once, becoming extended, while extended, finishing. A gesture (press / release without drag / begin drag / during / release), a form (arrive / leave untouched / begin editing / while editing / submit), a command (invoke / exit at once / begin running / while running / finish), a chat turn (compose / answered at once / response begins / streaming / complete).
- *The variant axis*: what changes the outcome of the same interaction (modifier keys; role and record state; flags and TTY-ness; mode and attachments).
- *The interrupt list*: what can happen in the middle. Build it from five families: the user's explicit abort; the user doing something else mid-way; the environment failing (focus, network, session, process); something else changing the target; the input channel changing. Same rows, same order, in every document.
- *The cross-cutting concerns*, in a fixed order (permissions, history, containers, locked or readonly state, offline, collaboration, notifications, preferences, whatever the product has).

Skim the source repo for where interaction state lives, where the behavior tests are, where the UI is, and where defaults and thresholds are defined; list them in the README and in goal.md's reading order.

**2. Scaffold.** README, glossary (start with the interrupt words and the state words: selected, dirty, saved, running, done), goal.md, AGENTS.md. Commit.

**3. Pilot, foundations, hardest area — yourself, in sequence.** The pilot is one small feature with a real interaction; iterate until it is right, because every later document copies it (150–200 lines for a small feature). Foundations are the documents everything links to: the input or invocation model (thresholds, what cancels, completes, interrupts), the object or data model, the mode or navigation model. They own the numbers; as each is written, add its load-bearing facts to goal.md's "Established facts" so nothing downstream re-derives or contradicts them. Then the hardest area, the bulk of the experience: read all of its state handling first, decide which document owns which state, write it down in goal.md.

**4. The rest, in parallel.** Fan out with subagents, one document each. Prompt: read goal.md, README, glossary, the pilot, and the relevant foundation; write this one document on the same skeleton at the same depth; add missing glossary terms rather than coining synonyms; touch nothing else. Review each result against the glossary and established facts before accepting. Mark `drafted` in the coverage table.

**5. Consistency pass.** Same word for the same thing everywhere and every word in the glossary; no behavior described differently in two places (one owns it, the other links); every relative link and anchor resolves (script it); same interrupt rows and cross-cutting order in every document; README structure and coverage table match the disk.

**6. Verification checklists.** One file per cluster, one table per document, one row per observable claim: `ID | P | Needs | Claim (link to section) | Setup | Steps | Expected | Result`. P1 = an established fact or a suspected bug, P2 = an ordinary claim, P3 = a number, color, or timing. Every non-"no effect" variant and interrupt cell gets a row; every suspected bug gets a P1 row. `verification/README.md` says how to bring the product up, confirm the commit, run P1 then P2 then P3, record `pass`/`fail`/`blocked`, and file every fail in bug-triage.md (a fail may mean the document is wrong; say which). If you can drive the product yourself, run what you can, record it, and state exactly what that pass did not cover. A document becomes `verified` only when a person has run its P1 and P2 rows.

**7. Bug triage.** Collect every "looks like a bug" from every document, merge by root cause, and write each up: where the user meets it, what happens vs. expected, reproduction, the cause in the code (file and line), severity (high: loses work, traps the user, or affects every feature; medium: wrong but recoverable; low: cosmetic), decision needed (`fix` or `product call`), raised by (links). Summary table sorted by severity. Filing upstream is outward-facing: offer, do not do it unasked.

## The document skeleton

Every feature document, all eight sections, in this order. Foundations and UI documents may drop a section that does not apply but must still cover interrupts wherever an interaction exists.

```markdown
# The <feature>

## Summary
One abstract paragraph, then where it lives, how it is reached, what shows it is active, whether it is available in restricted states.

## The simple case
The common path in prose, no variants. Where the user lands afterwards.

## The interaction, event by event
One Mermaid stateDiagram-v2 of the states the user passes through, transitions labeled with the trigger and (commit / discard).
### <Starting>        what begins it, what is targeted, captured, validated, shown; which variant set now changes the outcome
### <Ending at once>  the short path: what is committed or recorded (say so when nothing is), what happens next
### <Becoming extended>  what crosses the line, what is fixed from that instant on, what begins visibly
### <While extended>  what updates live and how, in user terms; what the user can still do
### <Finishing>       what is committed and in how many undo steps or records, side effects, the failure path

## Modifiers
| Variant | Set at the start | Changed while extended |   every cell filled, "No effect." where true

## Cancel and interrupt
| Event | Before extended | While extended |   the fixed rows, every cell filled; then what state the user is left in

## Interactions with other systems
One bold-led paragraph per cross-cutting concern, fixed order, "no interaction" still gets its line.

## Edge cases
Bullets: limits, boundaries, nesting, repeated invocation, empty states, started one way and finished another.

## Open questions and verification
- What was read from code but not confirmed by hand.
- What looks like a bug, stated as such.
Verified against <repo> commit `<sha>`.
```

## Writing rules (put these in goal.md)

- Describe the experience, not the code: "the form stays disabled until the server answers", not "the mutation sets isPending".
- Technical detail only in `> Technical note:` block quotes, and only when the mechanism changes what the user would expect.
- Sentence case headings. Direct and concrete. No hedging, no marketing.
- Say surprising behavior plainly, with the reason if the code gives one. If it looks like a bug, say so in "Open questions"; do not smooth it over.
- Link to the document that owns a fact instead of restating it. Foundations own thresholds and definitions.
- Use the glossary's words. A word not in the glossary is a bug: add it or use the existing term.
- When code and tests do not settle a behavior, write what they do settle, list the rest under "Open questions", move on. Never guess, never block.
- Never modify the source repo. Commit as `docs: add <path>` / `docs: revise <path>`, following the repo's convention on attribution.
