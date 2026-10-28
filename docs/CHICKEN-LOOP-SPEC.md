# KashChickens — Farm & My Chicks Consistency Spec

**Date:** 2026-10-28  
**Status:** Implementation in progress. Locked decisions D1–D4 and D6, plus D5 (Income read-only) and D7 (atomic global serials), are implemented. Only D8 (toast timing) and the F6 daily-gate policy remain open.  
**Scope:** Home ("The Farm"), My Chicks (`CollectionView`), the legacy Income page, and the server endpoints that back them.  
**Baseline:** working tree at `53ab216` + the uncommitted hatch/feed changes. `npm run lint` (`tsc --noEmit`) passes.

---

## 1. Executive summary

The egg → chick → hen loop currently has three different feeding experiences, two names for the same destination, two labels for the same collect action, and a progress display that can appear to jump because identical runs are rendered in an unstable order.

The reported bug ("re-hatch, first feed, the counter jumps from 1/20 to 5/20, or cards change position") is most likely **not** a server arithmetic bug. It is a presentation/ordering bug with a real product cause:

1. Repeat hatches are allowed, so two active runs of the same egg can exist at once.
2. My Chicks renders both as visually identical cards.
3. A newly hatched run is optimistically **prepended** to the list (`App.tsx:706`), while every refetch replaces the list with the server's **unordered** rows (`db.ts:1013`, `App.tsx:644`).
4. The list therefore flips from newest-first to the database's natural order. The older run (already at 4 feeds, displayed as "Day 5/20" because the pill shows `daysFed + 1`) lands in the slot where the new run (Day 1/20) was.
5. The feed animation is keyed by `itemId`, so every card of that egg type also shakes together, reinforcing the illusion that one card jumped.

The spec below documents the full review, the locked decisions, and the phased fix plan. Sections 6–7 track implementation status; section 9 keeps the remaining open decisions (D5, D7, D8).

---

## 1b. Locked decisions (2026-10-28)

| # | Decision | Choice |
|---|---|---|
| D1 | Repeat hatches | Keep allowing them. Fix ordering and give each run a visible identity. |
| D2 | Final feed | One **Keep hen** tap. It claims the collectible and the hen stays in **Completed cycles**, visible in the showroom below. |
| D3 | Collect label | **Keep hen** everywhere. |
| D4 | Home daily reward | Keep it and rename it **Daily bonus**. The 30-day calendar and streak page keep working. |
| D5 | Income page feeding | Resolved: Income is read-only for chickens; feed and keep actions route to My Chicks. |
| D6 | Day label | Keep **Day 3/20** (not "Day 3 of 20"). The progress bar must use the same number as the label. |
| D7 | Serial scope | Existing intent kept: global per item, now allocated atomically. Per-user numbering can still be requested. |
| D8 | Toast timing | Still open. Recommended: toast when the animation starts. |

Implementation status for the locked items is in sections 6 and 7.

---

## 2. Reported bug: "1/20 → 5/20" and moving cards

### 2.1 Reproduction (most likely path)

1. Hatch egg X. Run A starts with `daysFed = 0`, shown as `Day 1/20`.
2. Without collecting A, hatch egg X again (the Home card always offers "Hatch egg"; nothing warns that a cycle is still running). Run B is created with `daysFed = 0`.
3. `handleSubscribeSuccess` prepends B: `[B (Day 1/20), A (Day 5/20)]`.
4. Feed B. The server correctly writes `daysFed = 1` for B and returns `daysFed: 1`.
5. `handleClaimSuccess` updates B locally, then calls `handleManualStatsRefresh()`, which refetches `/api/subscriptions/:phone`.
6. The server query has **no `ORDER BY`** (`db.ts:1013`). The returned array is in the database's natural order, typically oldest-first. It replaces the optimistic newest-first array.
7. The top slot now holds A, which reads `Day 5/20`. B, now `Day 2/20`, has moved down.
8. The user sees the card they just fed "jump from 1/20 to 5/20", and sees cards change positions.

The same reorder also happens on the 60-second background poll (`App.tsx:670-672`) with no feed involved, which matches "they're changing positions in the list i'm not sure".

### 2.2 Why each ingredient exists

| Ingredient | Evidence | Effect |
|---|---|---|
| Repeat hatches allowed | `db.ts:784-798` | Multiple active runs of one egg type are normal |
| New run prepended | `App.tsx:706` | Temporary newest-first order |
| Refetch has no ordering | `db.ts:1013`; `App.tsx:644` | Order flips on every refetch |
| Cards are indistinguishable | `CollectionView.tsx:405-447` | Same art, same name, no hatch date or run number |
| Day pill is `daysFed + 1` | `CollectionView.tsx:398,445` | A 4-feed run reads "Day 5/20" |
| Animation keyed by egg type | `CollectionView.tsx:113-118,157-158,167,407,415` | All same-type cards shake/reveal together |
| Celebration selector keyed by egg type | `CollectionView.tsx:169-174,407` | All same-type cards get a burst |

### 2.3 Single-run check

If a user has **only one** active run and the counter still jumps by more than one after a single feed, that would contradict the server code: `claimDailyReward` locks the row and writes `daysFed + 1` (`db.ts:1333-1339, 1381, 1456-1461`). Before shipping the fix, add a temporary diagnostic log of `{ subId, daysFedBefore, daysFedAfter, response.daysFed }` to confirm. The spec's acceptance criteria cover both cases.

### 2.4 Proposed fix for the bug

1. **Deterministic order everywhere.** Add `ORDER BY startDate DESC, id DESC` to `getUserSubscriptions` (`db.ts:1013`). Add a shared `sortRuns()` helper in `runs.ts` and apply it wherever `activeNodes` is set or rendered. One comparator, used by Home, My Chicks, and Income.
2. **Optimistic insert must use the same comparator.** In `handleSubscribeSuccess`, insert the new run according to `sortRuns()`, not `[newSub, ...prev]`.
3. **Make same-type runs distinguishable.** Show at least one of: "Hatched today / 3d ago", "Run 2 of 2", or a small `#2` badge. Prefer hatch time; it is data we already have (`startDate`).
4. **Key all feed feedback by `node.id`.** Shake, reveal, `feedingId`, `data-feed-card-item`, and celebration rect lookup must use the run id, not `itemId`.
5. **Make the day label match the bar.** Locked: keep `Day {daysFed + 1}/{total}` and set the bar to `(daysFed + 1) / total`. A fresh run starts at Day 1/20 and 5%; the first feed moves it to Day 2/20 and 10%.
6. **Repeat hatches stay allowed.** Each run gets a hatch-age chip, a stable position, and its own animation key. No blocking, no stacking.

### 2.5 Acceptance criteria for this bug

- Given two active runs of the same egg at days 1 and 5, the list order is identical after hatch, after a feed, after a manual refresh, and after the 60-second poll.
- Feeding a card changes exactly that run's day counter by +1 and leaves every other card unchanged.
- The card that was fed keeps its position unless the chosen sort rule intentionally moves it (for example, completion moves it to Completed).
- No two cards of the same egg type shake or animate unless both were actually fed.
- A run that has never been fed can never display more than "Day 1/N".
- Re-hatching while a run is active either (a) shows a distinct new card with its own identity, or (b) is blocked with an explicit message, per D1.

---

## 3. Canonical loop and vocabulary

### 3.1 Proposed state machine

```
Egg catalog
   │  Hatch egg (pay price, create run)
   ▼
Chick, day 1..N  ── feed once per platform day ──►  day +1
   │
   │  final feed (day N)
   ▼
Completed cycles  ── "Keep hen" ──►  Kept hen + Collectible showroom
```

Rules:

- Feeding happens in **My Chicks → Growing chickens**, once per Africa/Nairobi platform day.
- Only the run's own card can feed it.
- The final feed is explicit: the card says "Final feed · this hen moves to Completed" before the tap.
- Completion never silently removes a card. The run moves to **Completed cycles** and stays there.
- **Keep hen** is one tap. It claims the collectible, marks the card "Kept hen", and adds the hen to the showroom below the completed list.
- Kept hens remain visible in Completed cycles; they do not disappear when the collectible is claimed.
- Home may summarise ("2 hens ready") and link to My Chicks, but must not offer a collect button that can silently disappear.

### 3.2 Canonical names

| Concept | Use | Retire |
|---|---|---|
| Home page | **The Farm** | "My farm", "dashboard", "farm" as a page label in mixed case |
| Chick management page | **My Chicks** | "My chicks" (lowercase), "collection", "My farm" as a destination |
| A single run | **chicken** / **run** | "node", "subscription" in user-facing copy |
| Daily action | **Feed** | "claim", "collect income", "check in" for the chicken loop |
| Cycle completion action | **Keep hen** | "Collect hen", "Claim collectible" (two labels, two steps) |
| Home daily reward | **Daily bonus** | "Feed your chick", "Chick fed", "Check-in" |
| Showroom | **Hen house** or **Showroom** | "collection", "My farm" |
| Egg count metric | **Hatches** | "x / y eggs" progress reading |

### 3.3 Copy deck (current → proposed)

| Surface | Current | Proposed |
|---|---|---|
| Hatch success modal | "Your chick is waiting on the farm. Go to My Chicks and feed it once a day to grow it into a hen." | "Your chick is in My Chicks. Feed it once a day. On the final feed it moves to Completed, where you can keep it as a hen." |
| Hatch modal body | "Feed your chick once per day. Each feed advances its {n}-day cycle." | "One feed per day. After {n} feeds this chick becomes a hen." |
| Hatch modal footer | "Your chick hatches here, then My Chicks is where its daily feeds happen." | Removed. The modal keeps the egg art, cost, and actions only. |
| Home daily card CTA | "Feed your chick" / "Chick fed" | "Claim daily bonus" / "Daily bonus claimed" |
| Daily bonus success toast | "Chick fed" + "added to your withdrawable balance" | "Daily bonus claimed" + amount |
| Feed success toast | "Fed {name}." after 3 s | "Fed {name}. Day {n}/{total}." immediately or after the animation |
| Feed-all success | "{amount} fed to your chickens." after 3 s | "{amount} fed. {n} chickens advanced." immediately after animation |
| Feed-all empty | error "Your chickens have all been fed today. Come back tomorrow." | info "Nothing to feed right now. Come back after midnight EAT." |
| Completed card action | "Collect hen" | "Keep hen" |
| Pending collectible action | "Claim collectible" | Removed. **Keep hen** claims inline on the completed card. |
| Home collect success | "added to your collection!" | No Home claim. A "N hens ready to keep" banner links to My Chicks. |
| My Chicks collect success | "added to My farm!" | "Hen kept. Collectible #003 is in your showroom." |
| Server stale error | "This chicken has completed its cycle. Collect it before hatching again." | "This cycle is finished. Keep the hen, then hatch a new egg." |

---

## 4. Findings

Severity: **P0** breaks the loop or risks data; **P1** contradicts the loop or copy; **P2** visual/interaction inconsistency; **P3** polish.

**Resolved in the 2026-10-28 pass:** F1, F2, F3, F4, F5, F7, F8, F9, F10, F11, F12, F14, F15, F16 (sound only), F17, F18, F19, F20, F21 (count), F22, F23, F24, F26, F31, F32, F34. **Partially resolved:** F13, F16 (toast timing), F29. **Still open:** F6, F25, F27, F28, F30, F33.

### P0 — Loop-breaking and data safety

**F1. Unstable list order + indistinguishable repeat runs (the reported bug).**  
`db.ts:1013` has no `ORDER BY`; `App.tsx:706` prepends; `App.tsx:644` replaces with server order. `CollectionView.tsx:405-447` renders same-type runs identically. Impact: counters appear to jump, cards swap, users feed the wrong chicken. Fix: Section 2.4.

**F2. Home "Collect hen" is effectively unreachable after a repeat hatch.**  
`DragonsHomeSection.tsx:199-209` keeps only the newest run per egg; `:622-626` only offers collection when that newest run has an unclaimed collectible. Any older finished run is invisible on Home. With repeat hatches this is the normal case. Fix: derive a list of all finished, unclaimed runs and show a "N hens ready" link, or remove the Home collect button and route to My Chicks.

**F3. The final feed mints a collectible in two unexplained steps.**  
The last feed sets `status: "expired"`, removes the run from "Growing chickens", and mints a `claimedAt = NULL` collectible (`db.ts:1463-1468`, `1043`). The card then reappears as a separate "Claim collectible" item (`CollectionView.tsx:234,717`). Hatch copy never mentions this (`DragonsHomeSection.tsx:770,795,829`). Fix: one "Keep hen" action on the completed card, or explicit copy and an in-place two-step card.

**F4. Feed-all races with per-card feed.**  
`CollectionView.tsx:91` checks only `feedingId`; `:131-132` checks `isFeedingAll || feedingId`; per-card buttons are disabled only by `feedingId === node.id` (`:458`). During Feed-all every card is tappable, producing double claims or a false "already fed" error. Fix: guard `feedChicken` with `isFeedingAll` and disable all feed buttons while it runs.

**F5. Feed-all triggers N full-app refetches that abort each other (resolved).**  
`CollectionView.tsx` called `onClaimSuccess` per success, and each call refetched six endpoints. Feed-all now passes `deferRefresh = true` for every run, then calls `onRefresh` once after `Promise.allSettled`; the single refetch reconciles all balances and run rows.

**F6. Every repeat hatch resets the daily feed gate.**  
A new run is created with `lastClaimedDate: ""` (`db.ts:770`), so `getRunClaimableReturns` considers it feedable immediately (`runs.ts:87-94`), even if the user already fed another run of the same egg today. Hatching and feeding repeatedly can produce multiple daily payouts per egg type in one day (at egg cost). Decide whether this is intended; if not, gate new runs to the next platform day or block a second active cycle.

**F7. Server copy still forbids repeat hatching.**  
`db.ts:1371` throws "This chicken has completed its cycle. Collect it before hatching again." while `db.ts:784-798` explicitly allows repeated hatches. Any stale tab or double tap surfaces a rule that no longer exists. Fix: update the message to "This cycle is finished. Keep the hen, then hatch a new egg."

**F8. Claim/collectible read and write endpoints are unauthenticated (resolved).**  
`GET /api/collectibles/:phone`, `POST /api/collectibles/claim`, `GET /api/subscriptions/:phone`, and `POST /api/user/redeem_gift_code` now require a signed session whose phone matches the requested phone, mirroring subscribe/claim/check-in.

**F9. Gift-code redemption has a check-then-write race (resolved).**  
`redeemGiftCode` now runs in a transaction and locks the user row with `SELECT ... FOR UPDATE` before checking `redeemedGiftCodes`, so two parallel taps credit the code once.

**F10. Collectible serials can collide (resolved).**  
Minting now locks a per-item row in `collectible_counters` and increments `next_serial` inside the same transaction as the collectible insert. The bootstrap seeds counters from `MAX(serial)` so existing collections continue without duplicate numbers.

### P1 — Loop and copy contradictions

**F11. Three feeding surfaces with three rule sets (resolved).**  
Home's daily reward is now **Daily bonus** and no longer claims to feed a chicken. Income is read-only for chickens: its feed and keep actions route to My Chicks. Only My Chicks calls `/api/subscriptions/claim` for chickens.

**F12. "Feed" is used for a cash check-in and for chicken progression (resolved).**  
The Home check-in is "Daily bonus" on Home, streaks, guide, transactions, and server notifications. Chicken progression keeps "feed" and "Day n/total"; the server's two errors use distinct wording.

**F13. Four names for two destinations.**  
Bottom nav "The Farm" / "My chicks" (`App.tsx:1217-1240`); Home header "…'s farm" / "My farm" (`DragonsHomeSection.tsx:392`); Home menu "My farm" (`:425`); toasts "added to your collection!" (`:309`), "added to My farm!" (`CollectionView.tsx:221`), "permanently yours!" (`:195`). Fix: "The Farm" and "My Chicks"; "showroom" for the collectible display.

**F14. Same action, two labels (resolved for chickens).**  
My Chicks uses **Keep hen** and shows "Kept hen" after success. Home no longer offers a collect button; its banner links to My Chicks. Income routes chicken keep actions to My Chicks with the same label. Non-chicken collectibles still use "Claim collectible" on Income.

**F15. Hatch copy promises a hen, not a collectible.**  
`DragonsHomeSection.tsx:770,795,829` says feed daily "to grow it into a hen" but never says the hen becomes a collectible that must be kept, or that it leaves the growing list. Fix: copy deck in 3.3, plus the in-place completed state.

**F16. Feed-all is silent and asynchronous in a different way from single feed.**  
Single feed primes and plays the sound (`CollectionView.tsx:101,121`); feed-all only primes (`:142`) and never calls `playCheckinSound`. Both show the success toast after 3 seconds (`:122,176`). Gift-code success is also delayed 3 seconds (`DragonsHomeSection.tsx:31,132`). Fix: same sound/animation/toast timing for both feed paths; prefer immediate toast after the animation.

**F17. Feed-all stays enabled when nothing is ready.**  
`CollectionView.tsx:356` only disables for `isFeedingAll`. With nothing feedable it still looks active and answers with a red error (`:138`). Fix: disable when `ready.length === 0`, and show the next-feed countdown in the label or an info toast.

**F18. Home's hatch metric reads as impossible progress (resolved).**  
Home now shows only the lifetime egg-hatch count. The type-coverage copy was removed, so there is no numerator/denominator mismatch.

**F19. Daily income rounds differently on Home and My Chicks (resolved).**  
Home now sums `getRunMinimumClaimAmount`, the same `Math.ceil` rule My Chicks uses.

**F20. Status checks are case-sensitive in My Chicks (resolved).**  
`CollectionView` now classifies chickens with `isRunCycleFinished`, which lowercases status and shared run math, so legacy `"Active"` rows behave the same on Home, Income, and My Chicks.

**F21. Completed count can disagree with the visible list.**  
`CollectionView.tsx:236-239` counts every finished run plus every collectible; `:234` hides any run that already has a collectible (including unclaimed ones). The header can read "3" while the list is empty and only claim cards sit below. Fix: derive the count from the same list the user sees, or show a separate "Ready to keep" count.

### P2 — Visual and interaction

**F22. Home's daily card is still frosted glass (resolved).**  
`GenesisEggCard` now uses the solid card token and border used by the rest of Home and My Chicks, keeping the gold accent.

**F23. Feed animations are keyed by egg type (resolved).**  
Shake/reveal and celebration selectors now key on `node.id`, so feeding one run never animates another of the same egg type.

**F24. Home egg cards carry the feed-celebration selector (resolved).**  
`data-feed-card-item` was removed from Home; My Chicks uses `data-feed-run-id` on its own cards.

**F25. No back affordance from My Chicks.**  
`CollectionView.tsx:11,31,38` imports `ArrowLeft` and accepts `onBack`, but never renders either. `App.tsx:1003` wires a working `onBack`. Users arriving from Home or Income have only the bottom nav. Fix: render a back button in the My Chicks header on all viewports.

**F26. The farm backdrop cannot recover from a failed image (resolved).**  
`FarmBackdropImage` now resets its failure state when `src` changes. The enter animation remains; a symmetric exit transition is still a polish item.

**F27. Hardcoded third-party art with no fallback.**  
`DragonsHomeSection.tsx:639` and `CollectionView.tsx:411` use Pinterest hotlinks for card backgrounds, with no `onError`. This is outside admin control and a likely source of "the image looks broken". Fix: use admin-configured assets or bundled art; add an `onError` placeholder.

**F28. Config URL healing is partial.**  
`sanitizeSiteConfig` / `repairConcatUrl` only cover `authBgImage`, `logoUrl`, and `authSlideImages` (`themeTokens.ts`). Product art, wallet logos, and VIP task images can still ship concatenated URLs, which then hit the unguarded `<img>` tags in F27. Fix: apply the same healing to every image field, or heal on read in one normalizer.

**F29. Unused back affordance (partially resolved).**  
`CollectionView.tsx` still accepts `onBack`, imports `ArrowLeft`, and never renders either; `App.tsx:1003` passes a working handler. `completedNodeIds` is not dead: it intentionally triggers the Home collectibles refetch when a run finishes. Fix: render the back button or remove the prop.

### P3 — Hardening and polish

**F30. `handleClaimSuccess` uses `Math.max` for balances.**  
`App.tsx:732-733` keeps the larger of the current and returned balances. Safe for feeding (which only increases), but it masks legitimate decreases if the callback is reused for withdrawals or corrections. Fix: trust the server value after a successful claim.

**F31. Home's active-income sum uses raw `dailyYield` (resolved).**  
Home now uses the shared `getRunMinimumClaimAmount`, matching My Chicks' rounding.

**F32. Hatch counts include every run ever created for the egg (resolved).**  
The metric now reads as a single hatch count under the "Eggs hatched" label, keeping the lifetime total separate from catalog coverage.

**F33. The daily bonus has two claim surfaces.**  
The Home `GenesisEggCard` and the Streaks page both POST `/api/user/checkin` for the same once-a-day reward, with different labels ("Chick fed" vs "Check-in collected"). The reward is correctly shared, but two claim UIs invite double taps and contradictory copy. Copy is now aligned to "Daily bonus"; decide later whether the Home card should deep-link to the streak calendar instead of claiming inline.

**F34. The day label and the progress bar used different numbers (resolved).**  
`CollectionView.tsx` showed `Day {daysFed + 1}/{total}` but filled the bar with `daysFed / total`, so Day 1/20 started at 0% and every feed moved the bar one day behind the text. The bar now uses `cycleDay / total`, matching the label.

---

## 5. Server changes

### 5.1 Ordering — done

```ts
// getUserSubscriptions
.orderBy(desc(schema.subscribedNodes.startDate), desc(schema.subscribedNodes.id))
```

The same comparator runs client-side in `sortRuns()` so optimistic inserts and server data agree.

### 5.2 Batch claim — resolved client-side

The client keeps per-run `POST /api/subscriptions/claim` calls for failure isolation, but each callback defers its refresh; My Chicks performs one refetch after `Promise.allSettled`. A dedicated batch endpoint is optional and no longer required.

### 5.3 Authentication — done

`GET /api/subscriptions/:phone`, `GET /api/collectibles/:phone`, `POST /api/collectibles/claim`, `POST /api/user/redeem_gift_code`, and `GET /api/user/gift_codes/available/:phone` now require a signed session whose phone matches the requested phone.

### 5.4 Serial allocation — done

Minting runs in a transaction and locks a `collectible_counters(item_id, next_serial)` row before incrementing it. The bootstrap creates the table and seeds it from `MAX(serial)` per item, so existing collections keep their numbers. The public scope stays global per item.

### 5.5 Copy and errors — done

- Stale "collect before hatching again" message replaced.
- Chicken feed and daily bonus use distinct wording.
- Claim responses continue to return `daysFed` and `lastClaimedDate`.

### 5.6 Gift codes — done

Redemption runs in a transaction and locks the gift row first, then the user row with `SELECT ... FOR UPDATE`, so a code credits once and the max-redemption limit cannot be raced. It validates active status, expiry, and remaining claims before writing.

Each successful claim is recorded in `gift_code_redemptions` (`gift_code_id`, `code`, `user_id`, `amount`, `redeemed_at`, unique `(code, user_id)`), and the gift's `current_redemptions` is incremented in the same transaction. Startup backfills the audit table from `users.redeemed_gift_codes` for claims made before the table existed and heals counters with `GREATEST(current_redemptions, claim count)`.

`GET /api/admin/gift_codes` returns `claims` with username, phone, amount, and timestamp plus a computed `currentRedemptions`, so admin cards show `Claims x/y` and the detail modal lists **Claimed by** (legacy claims included). The Gift Codes subtab refreshes on open and every 15s; an open detail modal syncs to the refreshed list.

The authenticated availability check (`GET /api/user/gift_codes/available/:phone`) returns `{ available, count, amount }` for active, unexpired codes the user has not redeemed and that still have claims left. Home polls it on mount/visibility and every 60s. When `count > 0`, the farm-menu gift-code icon gets a pulsing gold dot and the modal shows a shimmering corn + `UGX X available` line below the redeem button. Both refresh after a claim and disappear when nothing is left. The coin jingle plays as the egg shake starts.

### 5.7 Landing active-farmers ticker — done

The welcome screen shows a live **N active** count under the **Log in** button. It is intentionally display-only social proof, not a real presence count.

- `activeFarmersBase` (default `300`) is the manual baseline. Real `totalUsers` from `GET /api/system/stats` is added once on top, so the ticker always includes actual registrations.
- `activeFarmersCeiling` (default baseline + 160) is the hard cap. When it is set below the current floor, the floor wins and the ticker holds steady instead of shrinking below the manual baseline.
- The number seeds between 45% and 75% of the range, then every 2.4–4.6s takes a mean-reverting random step (up to ~14% of the range) and eases to the new value over 700ms with `requestAnimationFrame`. It never leaves `[floor, ceiling]`.
- `prefers-reduced-motion` skips the tween and snaps to each new value.
- Admin → Brand Identity → **Landing Active Ticker** edits both values and saves through `PUT /api/admin/config`; `GET /api/config/site` exposes them to the welcome screen. Raising the baseline is the manual way to inflate the displayed crowd.

---

## 6. Client changes

### 6.1 Shared run helpers (`src/utils/runs.ts`) — done

```ts
export function sortRuns(nodes: SubscribedNode[]): SubscribedNode[] {
  return [...nodes].sort((a, b) => {
    const byStart = new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
    if (byStart !== 0) return byStart;
    return b.id.localeCompare(a.id);
  });
}
```

Used in `applyUserDataResults`, `handleSubscribeSuccess`, and `handleGpuSuccess`, and enforced by the server `ORDER BY`. Never rely on array insertion order.

### 6.2 My Chicks card identity — mostly done

- [x] Hatch-age chip on every card (`Hatched just now`, `3d ago`) so repeat hatches are distinguishable.
- [x] `node.id` used for `key`, shake/reveal sets, `data-feed-run-id`, and celebration lookup.
- [x] `activeChickens` / `completedCycles` derived from the run math, not raw status strings.
- [x] Completed count equals the visible completed list (kept hens stay counted).
- [x] Final-feed hint: "Final feed · this hen moves to Completed".
- [x] One **Keep hen** action inline; card flips to "Kept hen" after success.
- [ ] Render the `onBack` button (F25).

### 6.3 Feed flow — mostly done

- [x] `feedChicken` guarded against feed-all and against a second tap while feeding.
- [x] All feed buttons disabled while feed-all runs.
- [x] Feed-all disabled when no chicken is ready, with an explanatory title.
- [x] Same sound for feed-all as for single feed.
- [x] Batch or single-refetch feed-all (F5): per-run callbacks defer, then one refetch after all settle.
- [x] Card feed button shows corn + **Feed** when the chick is ready, and the next-feed countdown while waiting; amount stays in the accessible label.
- [ ] Show the success toast when the shake/reveal starts instead of after 3 s (D8).

### 6.4 Home — mostly done

- [x] `latestNodes` and the per-egg "Collect hen" button removed.
- [x] "N hens ready to keep" banner links to My Chicks; collectibles refetch when Home becomes active.
- [x] `data-feed-card-item` removed from egg cards.
- [x] Check-in copy renamed to "Daily bonus" on Home, streaks, guide, transactions, notifications.
- [x] Daily bonus calendar tiles scroll horizontally without a visible scrollbar.
- [x] Fix the hatch metric (F18/F32): show only the egg-hatch count.
- [x] Apply shared rounding to Home income (F31).
- [x] Solid card styling for `GenesisEggCard` (F22).
- [x] Egg/chick art tile uses the same liquid-glass/neumorphic treatment as the "Ready to hatch" modal; modal footer copy removed.
- [x] App header is a floating rounded bar matching the bottom nav (width, gradient, blur, shadow); radius is `1.25rem`, not a full pill.
- [x] Header floats over the scroll area (no layout row/clipping container); Home and tab content clear it via `.user-app-scroll` and pass behind the pill, clipping at the header's top edge. Sticky section headers stop below it.
- [x] Farm menu button aligns with the "chicken farm" text row and ends with a right-pointing caret; the menu modal is a palette-gold glossy 3D slab with flat, tile-less menu items, larger artwork, and larger labels.
- [x] Gift-code availability: pulsing gold dot on the farm-menu icon and a shimmering corn + `UGX X available` line under the redeem button; both update after a claim and clear when nothing is left.
- [x] Gift-code redemption plays the coin sound with the egg shake, keeps the modal open, resets the input, and shows the success toast after 1.5s.
- [x] "Chicken farm", "Growing chickens", and "Completed cycles" headings that sit directly on the backdrop use the palette gold; labels inside bordered cards keep theme text.
- [x] Invite overview button uses a larger Friends icon; invite-list avatars are fully covered by the same SVG.

### 6.5 Imagery — not started

- [ ] Replace Pinterest hotlinks with admin-configured art or bundled assets.
- [ ] Add `onError` fallback to every user-content image (products, eggs, wallet logos, VIP tasks).
- [x] Reset `FarmBackdropImage` failure state on `src` change.
- [ ] Extend `sanitizeSiteConfig` to all image fields.

---

## 7. Phased plan

### Phase 0 — Stop the reported bug (small, safe) — **done**

1. `ORDER BY` in `getUserSubscriptions`.
2. `sortRuns()` helper; use it for optimistic inserts and refetches.
3. Use `node.id` for feed animation, feeding state, and celebration selectors.
4. Add a run identity label for duplicate egg types.
5. Resolve the day-label semantics (D6): `Day n/total` with a matching bar.

**Exit:** two same-type runs never swap on feed/refetch/poll; the fed card advances by exactly one and stays put.

### Phase 1 — Make the loop truthful — **mostly done**

1. [x] Home completed-hen summary or removal (F2).
2. [x] In-place "Hen ready" state and one "Keep hen" action (F3, D3).
3. [x] Feed-all guard, sound, and disabled state (F4, F16, F17); one refetch after all claims (F5).
4. [x] Update stale server copy and split feed/bonus vocabulary (F7, F11, F12, F15).
5. [x] Hide or redirect the Income feed path (F11, D5).

**Exit:** a new user can hatch, feed, finish, and keep a hen without encountering two names for one action.

### Phase 2 — Visual and naming pass — **naming and metrics done, visuals partly done**

1. [x] Canonical names and toasts (F13, F14).
2. [x] Solid `GenesisEggCard` (F22).
3. [ ] Back button (F25).
4. [x] Backdrop recovery on `src` change (F26); exit animation still open.
5. [ ] Image fallbacks and URL healing (F27, F28).
6. [x] Metric and rounding fixes (F18, F19, F31, F32).

### Phase 3 — Server hardening — **done except F6**

1. [x] Auth on collectible/subscription/gift routes (F8).
2. [x] Gift-code transaction (F9).
3. [x] Serial allocator + backfill seed (F10).
4. [ ] Optional batch claim endpoint — no longer needed; the client defers and refetches once.
5. [ ] Daily-gate policy for repeat hatches (F6, D1) — repeat hatches stay allowed; only the gate policy is open.

---

## 8. Test matrix

### Bug regression

- [ ] Hatch X, feed once, force refetch: card reads "Feed 1 of 20" and does not move.
- [ ] Hatch X twice. Feed the newer run. Only that card advances; the older run keeps its day count and its position.
- [ ] Poll for 60 seconds without feeding. Order is unchanged.
- [ ] Feed a run to completion. It moves to Completed exactly once and does not duplicate.
- [ ] Two same-type runs: only the fed card shakes and receives the celebration burst.

### Loop

- [ ] New run: day label starts at 0 or 1 per D6 and reaches the total only after the final feed.
- [ ] Final feed produces a hen-ready state with one clear action.
- [ ] `Keep hen` adds one collectible, removes the hen from the ready list, and shows it in the showroom.
- [ ] Feed-all with 0, 1, and 5 ready chickens: correct amounts, one refetch, one sound, no double claims.
- [ ] Tapping a card during feed-all is ignored (no toast error).
- [ ] After midnight EAT, the next feed becomes available; before midnight it shows the countdown.

### Naming and copy

- [ ] "Feed" appears only in the chicken loop.
- [ ] The Home daily action is named "Daily bonus".
- [ ] The same action uses one label everywhere ("Keep hen").
- [ ] No toast says "collection", "My farm", or "My chicks" in mixed case.

### Gift codes

- [ ] Available code lights the gold dot and shows the shimmering `UGX X available` line; redeeming it updates both, and the last claim clears them.
- [ ] Redeem plays the coin sound with the egg shake, resets the input, keeps the modal open, and toasts after 1.5s.
- [ ] Admin `Claims x/y` and **Claimed by** match the audit rows, including legacy claims.

### Landing ticker

- [ ] The active count changes on its own every few seconds and never rises above the configured ceiling or falls below the baseline plus real users.
- [ ] Raising **Baseline people** in Admin → Brand Identity raises the displayed count after save; the new value persists across reloads.
- [ ] A ceiling below the baseline leaves the ticker steady at the baseline instead of dropping below it.
- [ ] With reduced motion enabled the number updates without tweening.

### Server

- [ ] Unauthenticated calls to the protected routes return 401.
- [ ] Parallel gift-code redemption credits once.
- [ ] Parallel minting produces unique serials.
- [ ] Claiming an already-finished cycle returns the new copy, not the stale "collect before hatching again".
- [ ] Two parallel claims for the same run credit once.

---

## 9. Decision log

Locked 2026-10-28:

| # | Decision | Locked choice |
|---|---|---|
| D1 | Repeat hatches | Allow them. Stable order + hatch-age chip + per-run keys. |
| D2 | Final feed | One **Keep hen** tap after the final feed. No auto-mint. |
| D3 | Collect label | **Keep hen**. |
| D4 | Home daily reward | Keep it, renamed **Daily bonus**. |
| D6 | Day label | `Day {daysFed + 1}/{total}`; bar uses the same number. |

Still open:

**D5. Income page.** — resolved.
Income is read-only for chickens. "Feed in My Chicks" and "Keep hen in My Chicks" route to the collection tab; non-chicken runs still claim inline.

**D7. Serial scope.**
- Global per item (current intent), or per user? Global is better for a collectible market; per user is easier. **Implemented as global per item with atomic allocation.** Changing to per-user numbering is still open if desired.

**D8. Toast timing.**
- Keep the 3-second delay for animation, or show immediately? Recommendation: show the toast when the shake/reveal starts, and keep the delayed confetti only.

---

## 10. Risks

- **Existing duplicate active runs.** Any change to D1 needs a one-time audit. Users may already have several active runs of one egg; blocking new hatches must not hide the existing ones.
- **Existing collectible serial gaps/duplicates.** Dedupe before adding a unique index. Renumbering changes user-visible IDs; do it only after a backup.
- **Auth roll-out.** The client already sends cookies, but older sessions or cached tabs may start receiving 401s. Add a clear "sign in again" path.
- **Image replacement.** Removing Pinterest hotlinks requires the admin to have configured product art; otherwise the farm could look empty. Ship a bundled fallback.
- **Batch claim endpoint.** If one run fails, decide whether the batch is all-or-nothing. Recommendation: per-run results with a summary, so one bad run does not block the rest.

---

## Appendix — Evidence index

| Area | File:lines |
|---|---|
| Unordered subscriptions | `src/server/db.ts:1009-1040` |
| Optimistic prepend | `src/App.tsx:696-712` |
| Refetch abort/replace | `src/App.tsx:621-661, 754-758` |
| Repeat-hatch sweep | `src/server/db.ts:784-798` |
| Claim increments daysFed | `src/server/db.ts:1332-1385, 1456-1464` |
| Stale cycle error | `src/server/db.ts:1371` |
| Final feed mint | `src/server/db.ts:1463-1468` |
| Serial count | `src/server/db.ts:1129-1133` |
| Gift-code race | `src/server/db.ts:2678-2686` |
| Unauthenticated routes | `server.ts:919-927, 993-1018, 2783-2791` |
| Feed card render | `src/components/CollectionView.tsx:395-474` |
| Feed-all | `src/components/CollectionView.tsx:130-182` |
| Feed single | `src/components/CollectionView.tsx:90-128` |
| Home completed logic | `src/components/DragonsHomeSection.tsx:199-218, 620-716` |
| Home hatch copy | `src/components/DragonsHomeSection.tsx:758-829` |
| Home daily bonus | `src/components/GenesisEggCard.tsx:170-256, 277` |
| Legacy income feed | `src/components/IncomeView.tsx:159-173, 463` |
| Run math | `src/utils/runs.ts:34-153` |
| Backdrop | `src/App.tsx:58-68, 868-871` |
| Back prop | `src/components/CollectionView.tsx:11, 31-38`; `src/App.tsx:1003` |
| Hardcoded art | `src/components/DragonsHomeSection.tsx:639`; `src/components/CollectionView.tsx:411` |
