# Co-op Hatching: Product and UI Plan

**Status:** Planning draft  
**Branch:** `feature/gamified-coop-hatching`  
**Product context:** Cash Dragons is a mobile-first collectible farm game. The co-op feature must make shared hatching social and understandable while keeping each person's money, contribution, and daily action explicit.

## Product idea

Players can start a special co-op egg using a product configured by an admin. The host chooses one of two participation modes, invites a fixed group, and the egg starts only after every required seat is filled and ready. Each member feeds their own chick. A member cannot feed for another member.

The co-op invite link doubles as a referral link: it preserves the existing referrer attribution and carries a co-op invitation token. A new invitee can register through it, receive the normal registration bonus, and land on their farm with the co-op invitation ready to accept or decline.

## Rules

### Participation modes

| Mode | Who pays | Who receives co-op income | Invitee feed behavior |
| --- | --- | --- | --- |
| **Co-op payers** | Host and invited payers split the product cost equally. Each payer's share is locked until the run starts. | The daily co-op income is divided equally among the host and all accepted payers. | Each payer feeds only their own chick and can collect only their own share. |
| **Guest mode** | The host pays and locks the full product cost. | The host receives all co-op income. Guests receive no money from the run. | Guests can feed their own guest chick for the shared play experience. Feeding shows the corn-to-balance animation, but does not change any balance. |

Show each invitee their mode, required payment, and income eligibility before acceptance. Guest mode must say plainly that the host funded the egg and the guest will not earn income. Never ask a guest to pay into a run whose income they cannot receive.

### Invitations and group start

- The host selects an admin-created co-op product, participation mode, and all required group seats.
- Invitations can go to people in the host's referral list or be shared as an invite link/code.
- The invite link is also a referral link. Preserve the current referral code attribution and add a separate co-op invitation token; don't replace or overload the referral code.
- Invitees have **24 hours** to accept or decline. A new invitee who registers from the link first gets the existing registration bonus, then sees the pending invitation on their farm.
- An accepted payer must successfully lock their equal share before becoming ready. A guest accepts without payment.
- The co-op starts only when every required seat has accepted and every required payer's contribution is locked. Do not start a partially filled group.
- At 24 hours, an unfilled co-op expires. Refund all locked contributions, mark the invitation expired, and remove the co-op from every participant's active/pending lists. A past link must show an expired message and must not rejoin the run.
- Before the first feed, the host can cancel. Refund every locked contribution in full and remove the co-op from active lists. Make cancellation unavailable after any member has fed; at that point, the run follows its normal cycle and payout rules.
- A declined, expired, or cancelled seat cannot be silently reused. The host can create a fresh co-op invitation with a new expiration window.

### Feeding and missed feeds

- Each member feeds only their own chick. There is no action to feed another participant's chick.
- The farm card shows the member's own action first: **Feed your chick** or **You fed today**. Other participants' statuses are secondary context.
- Payers see their equal daily share and claim only that share. Guest feeding plays the corn flight animation but leaves the balance unchanged.
- Guest confirmation copy: **“Guest mode · You fed your chick for today. The host owns this run's earnings.”** Play the requested corn flight toward the header balance, but do not change the balance number or show an earnings amount. The explicit guest-mode confirmation must make clear that no money was credited.
- If a member misses a day, their chick remains un-fed for that day, but the rest of the group can continue. A missed member does not block other feeds or stall the run.
- Recommended payout rule: a payer's unclaimed share stays attached to that payer and is not redistributed to people who fed. Decide and display whether an un-fed day's share is still claimable or forfeited before implementation; recommendation is **forfeited for that day** to make feeding part of the co-op contract. Never transfer a missed share to another participant without explicitly changing the contract.
- The group status can show a calm summary such as **“2 of 4 fed today”**. It must not imply that the viewer can feed for the other two.

## Flow map

### Host creates a co-op

1. Select a co-op-enabled product from the store or farm.
2. Choose **Co-op payers** or **Guest mode**.
3. Review the host's required capital: equal share in payer mode, full amount in guest mode.
4. Select the group size and invitees from referrals or create a shareable co-op link/code.
5. Review the contract summary: total cost, each payer's lock, daily payout split, who earns, 24-hour expiration, and cancellation/refund cutoff.
6. Confirm. Show a waiting egg card with accepted seats, pending seats, locked amounts, and the expiration countdown.

### Invitee joins

1. Open the co-op link. If signed out, register or log in while retaining both referral attribution and co-op token.
2. After registration, show the normal welcome bonus feedback, then open the farm's pending co-op invitation.
3. Read the host, product, group size, mode, payment due (if any), payout eligibility, expiration, and cancel/refund conditions.
4. Choose **Accept** or **Decline**. Payers authorize and lock their share as part of acceptance; guests accept without payment.
5. Accepted invitees see the waiting state until every required seat is ready. On completion, everyone sees the same start time and the egg-to-chick reveal.

### Daily farm use

1. Each participant sees their chick, their own feed status, their own earnings if eligible, and the aggregate group count.
2. A payer feeds and collects their share; a guest feeds for the play experience and receives guest-mode feedback without a balance change.
3. The card updates that participant's status and the group count. Nobody can trigger another member's feed.

## Co-op lifecycle

```text
Draft → Waiting for members → Ready to start → Active → Completed
                  ↘ Expired / Cancelled (refund all locked capital)
```

- **Draft:** only visible to the host; no capital is locked.
- **Waiting for members:** invitation acceptance and payer locks are in progress; 24-hour deadline is running.
- **Ready to start:** all seats accepted and all payer funds are locked; server starts the run atomically.
- **Active:** individual feed status and payout are tracked per participant; no cancellation or transfers between members.
- **Completed:** cycle ends and each payer's remaining eligible share is settled by the agreed rule; guests receive no payout.
- **Expired/Cancelled:** terminal, idempotent refund of every lock; invitation tokens cannot be reused.

## UI direction: gamified farm with selective liquid glass

The goal is to add game feel to the existing minimal UI without turning every surface translucent. Keep the Cash Dragons deep-blue palette, warm corn/gold accents, collectible artwork, and clear money hierarchy.

- Use glass on non-financial surfaces: floating navigation, invite overlays, participant detail popovers, and celebratory hatch moments. Use a soft tinted fill, fine highlight border, restrained blur, and a short depth shadow.
- Keep balances, amount breakdowns, payment confirmation, contribution locks, refunds, and transaction history on opaque high-contrast cards. Glass must not reduce text contrast or make money details feel decorative.
- Let the egg be the main collectible object. Waiting state: intact egg, visible seats, and a calm countdown. Start state: one crack and reveal when the whole group is ready. Active state: the egg disappears and the accepted members' chicks become the farm scene.
- Show a distinct owner treatment in the avatar row (for example, a small crown/host ring). Tapping an avatar reveals the username; provide the same name on keyboard focus and accessible labels.
- Scale chick art to group size only for small groups. For larger groups, show a few chicks plus a `+N` count and the member avatar row; avoid creating a noisy wall of repeated SVGs.
- Use motion to explain state: invitation accepted, final seat filled, egg cracking, chick reveal, and payer feed. Respect reduced-motion settings. Guest mode can share the corn flight toward the header balance, but keep the displayed balance unchanged and label the result clearly.
- Keep every state usable on narrow phones first. Modals should fit short screens with internal scrolling; action buttons stay reachable; the member roster can wrap or scroll horizontally without hiding status.

### Key screens and states

1. **Co-op product detail:** artwork, group-size rule, payer/guest modes, capital per payer, daily income split, and start condition.
2. **Create co-op sheet:** mode selector, seat count, referral picker/link sharing, locked-capital summary, and contract confirmation.
3. **Waiting egg card:** host marker, accepted/pending seats, payer lock state, expiration timer, share/copy link, and host cancel action.
4. **Invitee decision card:** inviter identity, egg/product details, mode and explicit financial terms, plus accept/decline.
5. **Active co-op farm card:** egg/chick/hen artwork, participant avatars, individual own-feed status, group fed count, and payer's own earnings.
6. **Feed result:** payer receives a confirmed amount; guest gets the guest-mode message and no balance delta.
7. **Terminal states:** expired, declined, cancelled/refunded, completed, and inaccessible/used invite links.

## Implementation plan

### Phase 0 — settle contract details

- Confirm group size bounds and whether the host always occupies one seat.
- Confirm whether a declined invite opens that seat for a replacement before expiration.
- Confirm whether a missed payer feed forfeits that day's share (recommended) or leaves it claimable.
- Confirm completion settlement and what happens to an unclaimed payer share at the end of the cycle.
- Define one clear cancellation boundary: before the first feed, full refund; after first feed, no cancellation.

### Phase 1 — product and persistence model

- Add co-op configuration to admin-created catalog products: enabled flag, min/max group size, duration/yield source, and allowed modes.
- Model a co-op run separately from the existing individual `subscribed_nodes` rows. Current farm runs have one `userId`, so changing that table into a shared-owner object would blur ownership and make current claims risky.
- Add co-op membership rows with role (`host`, `payer`, `guest`), invitation status, contribution/lock/refund state, acceptance time, and per-member feed/earning state.
- Store the contract snapshot on the run at creation so later admin product edits cannot change a live co-op's price, duration, or payout terms.
- Use database transactions and idempotency keys for accepting, locking, starting, feeding, cancelling, expiring, and refunding.

### Phase 2 — server rules and APIs

- Validate invite token, eligibility, seat availability, and expiration on the server.
- Lock funds exactly once; reject duplicate or concurrent acceptance safely.
- Start only via an atomic all-seats-ready transition.
- Keep each member's feed action scoped to their membership; authorize payout only for payer roles.
- Implement automatic expiration and refund processing, plus a safe retry path if a refund fails.
- Preserve the current referral code attribution independently from co-op invite identity.
- Audit all money movement in transaction history with clear statuses and co-op metadata.

### Phase 3 — invite and farm UI

- Add co-op mode to product selection and host creation.
- Add post-register/login invite resolution and pending invitations on the farm page.
- Build waiting, active, missed-feed, guest-feed, expired/refunded, and completed card states.
- Add username reveal on participant avatars and accessible names without requiring a tap.
- Add explicit lock/refund and payout status messaging.

### Phase 4 — visual gamification pass

- Apply the selective liquid-glass system to the relevant overlays and navigation while preserving opaque money surfaces.
- Add the waiting egg, full-group crack/reveal, member chick scene, personal feed motion, and guest-only no-balance animation.
- Review at narrow mobile widths, short screens, tablet, and desktop; include reduced-motion and keyboard behavior.

### Phase 5 — release readiness

- Verify payer and guest ledgers, concurrent invites, repeated callbacks, expiration/refund retries, registration through referral links, and no cross-user feed/claim access.
- Pilot with small group sizes and limited co-op-enabled products.
- Track invite acceptance, group completion, expiration, feed completion per member, refund success, and support issues before expanding.

## Risks and guardrails

- **Ambiguous money terms:** show payer amount, split, guest status, and refund boundary before acceptance and again on the active card.
- **Group hostage:** one absent member must not block daily feeds after the co-op starts. Group fill is required only before start.
- **Invite reuse or race conditions:** use one-time membership state transitions and non-reusable terminal invite tokens.
- **Referral attribution collision:** preserve referral identity and co-op invitation identity as separate values.
- **Guest confusion:** guest feed animations are playful but never show a balance increase, payout amount, or ambiguous “earned” language.
- **Visual overload:** use glass as a depth cue on selected surfaces; maintain solid money cards and strong text contrast.

## Decisions to confirm before coding

1. **Missed payer feed:** recommendation: that day's share is forfeited, not reassigned; the run and other members continue.
2. **Declined seat:** recommendation: host may replace the seat while the original 24-hour window continues.
3. **Host cancel:** recommendation: host can cancel while waiting, or while active only until the first feed. Full refund applies only before the first feed.
4. **Guest seats:** recommendation: guests count toward the required group size and can feed, but never pay or receive income.
5. **Group size:** choose a small initial cap (for example 2–4 total participants) to keep the first release easy to understand and visually coherent.
