# Adjustable themes plan

This document is the plan and safe groundwork for letting a child pick a companion avatar that brings its own visual theme, while a new positivity theme becomes the default for new installs only. It records how the app works today, the proposed design, music evidence, policy risks, and the checks a later implementation must pass.

This pull request adds this document only. It does not change theme rendering, avatars, onboarding, music, tokens, rewards, purchases, storage, or store-listing copy. After it merges, the app should behave the same as it does now.

## 1. What exists today

There is no theme picker, no theme id in saved data, and no code that sets `data-theme`. Color, avatar, and “gamer” identity are three separate things that happen to ship together.

### 1.1 Color system that actually paints the app

`src/styles/theme.css` is the live palette. On `:root` it is the “Calm, Respectful Daylight” set: warm off-white surfaces, deep teal primary (`#0F766E`), amber secondary, lavender and sky accents, and dark slate text. `src/index.css` maps those variables into Tailwind v4 tokens (`--color-primary-accent` and the rest). `index.html` sets `theme-color` to `#F7F6F2`. The shell (dashboard, onboarding, sidebar) uses these variables plus some hardcoded teal and amber utilities.

`theme.css` also defines:

- `[data-theme='dark']`, an evening slate palette. Nothing in `src/` or `packages/` sets `data-theme`. The block is dormant.
- `[data-color-mode='high-contrast' | 'warm' | 'cool']`, applied by `applySensoryPreferences` in `src/services/sensoryPreferences.ts`. The saved shape is `SensoryPreferences.colorMode`: `default | high-contrast | warm | cool`. Default is `default`, which leaves the daylight palette in place. These modes are an accessibility control, not a personality theme.

`src/index.css` still mentions `--neon-glow-soft`, and several screens use the class `neon-text-primary` and `shadow-[var(--neon-glow-primary)]`. Those custom properties are not defined in `theme.css`. Game screens also hardcode cyan, violet, and purple Tailwind classes (`packages/games`). In daylight mode, a block at the bottom of `theme.css` remaps common `bg-slate-*` / `text-slate-*` utilities back onto the daylight variables. Game screens that use explicit `from-purple-900` gradients are not covered by that remap, so Brain Gym still looks neon while the homework shell looks calm.

Any future theme has to layer on top of this, and the sensory color mode has to keep winning when a child or parent turns on high contrast, warm, or cool.

### 1.2 Where the gamer identity actually lives

`src/config/blakeConfig.ts` exports `TUTOR_CONFIG` with `theme: 'roblox-gaming'`, `favoriteColor: '#a855f7'`, `visualPreferences.colorScheme: 'roblox'`, a Roblox-worded reward catalog (`pointsRequired`, “Game Pass”, “VIP Server”), gaming achievements, obby level names, and motivational lines. Those fields are not read by the dashboard, the shop, the wallet, or the reward hook. `getWelcomeMessage`, `getMotivation`, and `calculateLearningBonus` are exported and unused. `TokenWallet` has its own local motivation strings (“Token Master”, “Complete tasks to earn tokens”).

The gamer companion that users can see is the avatar catalog, not that config object:

| Id | Name | File |
| --- | --- | --- |
| `avatar-boy-headphones` | Focus Gamer | `/avatars/avatar-boy-headphones.png` |
| `avatar-girl-glasses` | Science Star | `/avatars/avatar-girl-glasses.png` |
| `avatar-teen-cap` | Street Scholar | `/avatars/avatar-teen-cap.png` |
| `avatar-teen-neon-hair` | Neon Thinker | `/avatars/avatar-teen-neon-hair.png` |
| `avatar-ai-buddy` | AI Buddy | `/avatars/avatar-ai-buddy.png` |
| `avatar-calm-reader` | Calm Reader | `/avatars/avatar-calm-reader.png` |

Defined in `packages/avatars/src/data/characters.ts`. `DEFAULT_AVATAR_ID` is the first row, Focus Gamer. Legacy emoji and ids (`🐉`, `focus-dragon`, `🎮`, `game-hero`, and the others) map to these six ids in `src/services/avatarShopData.ts`. `public/avatars/PLACEHOLDER.md` asks for original 256×256 art in a neon cyan/magenta style. The PNGs in that folder are the shipped faces. Nothing in the asset names or the placeholder note is a Roblox character or logo.

Onboarding (`src/components/core/FirstRunOnboarding.tsx`) offers all six avatars. The first card is Focus Gamer. Finishing onboarding writes `user_type`, optional `user_name`, `avatarState.selectedAvatarId`, and `onboarding_completed=true`, then grants the welcome token award. Startup in `src/App.tsx` always opens the dashboard. It reads `onboarding_completed` into a checklist flag. It does not route a first launch to the onboarding view by itself. Onboarding can be reopened from the parent/settings path via `onReopenOnboarding`.

Avatar state is stored under the key `avatarState` (SQLite `user_settings` on Android, `appStore` elsewhere). It holds `selectedAvatarId`, `unlockedAvatars`, `ownedItems`, `equippedItems`, `purchaseHistory`, and an optional `pendingPurchase`. All six characters start unlocked. Gear, frames, badges, and backgrounds are separate shop items with token costs. Equipping them does not change the color palette.

### 1.3 Positivity content that already exists

`src/services/dailyAffirmations.ts` holds 30 affirmations in six categories: `strength`, `effort`, `progress`, `kindness`, `belonging`, `capability`. `getDailyAffirmation` picks one per UTC date with a numeric seed. Check-ins (mood `great | good | okay | struggling`, optional reflection) are saved by `useWellnessHub` into `localStorage` key `daily_affirmations` through `appStore`, capped at 90 entries. That path does not use the SQLite `user_settings` table. The Wellness Hub (`src/components/features/WellnessHub.tsx`) shows the line, the mood buttons, and a thought journal backed by `src/services/cbtThoughtReframing.ts`. The parent dashboard reads `getAffirmationStats()` (streak, entries this week, mood trend).

The file header calls this a “research-based CBT technique” that “reduces anxiety and depression symptoms.” That wording is stronger than this plan allows for new content. There is no health-tip, body-tip, or spiritual catalog. A Bible question bank exists for worksheets; that is school content, separate from theme copy.

### 1.4 Music section

The Music screen is a radio picker only (`src/components/features/MusicLibrary`). Curated downloads are gone; `curatedMusicData.ts` says so (updated 2026-02-17). `CuratedTrack` in `src/types.ts` still lists categories `anime | christian | lofi | classical`, and `MusicPlaylist` still allows Spotify and YouTube shapes, but the screen does not render them.

Live stations in `RADIO_STATIONS`:

| Category | Stations |
| --- | --- |
| Anime | LISTEN.moe |
| EDM | SomaFM Beat Blender, SomaFM DEF CON Radio |
| Ambient | SomaFM Drone Zone, SomaFM Space Station |
| Classical | WQXR |
| Chill | SomaFM Groove Salad, SomaFM Cliq Hop |
| Gaming | SomaFM Sonic Universe |
| Variety | SomaFM Indie Pop Rocks, SomaFM Underground 80s |

Playback goes from the device straight to the stream host (`audioStreamService`). The privacy policy already says SomaFM, LISTEN.moe, and WQXR receive the device IP, and that Vibe Tutor does not see listening activity. The sensory `soundEnabled` flag gates app sound effects; it is a separate switch from the radio player.

### 1.5 How tokens, rewards, and purchases work

The live currency is one ledger. Themes must not add a second balance.

**Ledger.** `src/services/tokenService.ts` keeps a version-3 ledger at `vibetutor_token_ledger_v3`. On Android that string lives in SQLite `user_settings`. Elsewhere `appStore.setStrict` writes it. The record is `{ version: 3, balance, totalEarned, totalSpent, updatedAt, transactions, appliedOperationIds, operationFingerprints }`. Invariant: `totalEarned - totalSpent === balance`, all three are safe integers, and `totalEarned >= balance`. Transactions are capped at 200. Operation ids are capped at 500 and must be unique. A repeated id with the same type, amount, and reason returns `duplicate: true` and does not move the balance. A repeated id with different details is rejected. Spend fails with `insufficient_funds` when the balance is too low. Writes that do not persist return `persistence_failed` and leave the in-memory ledger unchanged.

Startup migrates, in order: a valid v3 record; then local `vibetutor_token_state_v2` plus `vibetutor_token_transactions_v2`; then the max of legacy `vibetutor_tokens`, `userTokens`, and `user_tokens` (and on Android the same keys in `user_settings`). A malformed canonical ledger throws and blocks token features rather than resetting to zero.

`useTokenEconomy` is a React view of that ledger. It does not keep its own copy. `handleEarnTokens` / `handleSpendTokens` in `App.tsx` are the only UI doors. A new earn (not a duplicate) also bumps `TokenEarnAnimation`.

**What a child earns today.** Amounts below are the ones the call sites actually pass. Several `TOKEN_REWARDS` entries in `src/services/tokenService.ts` (`MORNING_ROUTINE_*`, `EVENING_ROUTINE_*`, `HOMEWORK_*`, `FOCUS_SESSION_25MIN`, `FOCUS_SESSION_50MIN`, `FIRST_DAY_COMPLETE`, `LEVEL_UP`, and `THIRTY_DAY_STREAK: 200`) have no caller. Do not “align” them during theme work. That would change payouts.

| Event | Amount | Operation id | Where |
| --- | --- | --- | --- |
| Welcome, once | 25 | `onboarding:welcome-award` | `FirstRunOnboarding` / `App.tsx` |
| First-week checklist, once | 50 | `onboarding:checklist-complete` | `App.tsx` |
| Homework marked complete | 10 | `homework-complete:{itemId}` | `completionDeliveryService` |
| Focus session completed | 1 token per minute of that session | `focus-session:{sessionId}` | same service; amount is the session duration |
| Avatar-shop achievement bonuses | per `ACHIEVEMENT_TOKEN_REWARDS` (10–200) | achievement lifecycle ids | `achievementService.ts` |
| Daily worksheet challenge | 25 | `daily-worksheet:{date}` | `SubjectCards.tsx` |
| Chore completed | the chore’s `rewardTokens` (the form defaults to 10; a parent can type another whole number) | `chore:complete:{id}` | `SchedulesHub.tsx` |
| Brain Gym standard clear | base tokens, plus 25 when stars are 3 or more, then multiplied by `1 + streak * 0.1` and rounded, minimum 1 | `{sessionId}:completion` | `packages/games` `calculateStandardGameTokens` |
| Brain Gym chest | 50 | `{sessionId}:chest:{n}` | `useBrainGymState` |
| Brain Gym daily goal | 20 | `{sessionId}:daily:{date}` | same |
| Brain Gym streak day 3 / 7 / 30 | 30 / 75 / 250 | `{sessionId}:streak:{date}:{n}` | package `TOKEN_REWARDS`. The src copy says 200 for day 30 and is not what Brain Gym uses |
| Learning-realm standard clear | same base table and +25 for 3 stars, without the streak multiplier | `{sessionId}:completion` | `src/services/gameProgression.ts` via `RealmView` |
| Continuous games (math adventure, word builder, music notes, pattern quest) | per-answer amounts inside each game | session-scoped ids | those games call `onEarnTokens` directly |
| Denied reward request | refund of that reward’s `cost` | `reward-refund:{requestId}` | `useRewards` |

Brain Gym base tokens (`GAME_BASE_TOKENS`): anagrams 15, boss battle 20, crossword 15, math adventure 20, memory 10, music notes 15, pattern 20, sudoku 20, word builder 15, word search 10. Unknown ids fall back to 10. Brain Gym XP (`XP_PER_GAME = 10`, level every 100 XP) is a separate display stat in hub stats, not the token ledger.

**What a child spends today.**

- Avatar shop gear, frames, badges, and backgrounds. Character avatars cost 0. A purchase writes `pendingPurchase` on `avatarState` first (`avatar-purchase:{uuid}`, cost, reason `Bought {name}`), then `spendTokens`. Equip and unequip do not spend. Shop prices in `avatarShopData.ts` run from 100 (Mathematician’s Cap) to 250 (Philosopher’s Robe).
- Parent-defined rewards. The catalog is `Reward { id, name, cost, description? }` in SQLite table `rewards` (`points_required` mapped to `cost`) or `appStore` key `parentRewards`. It starts empty. Parents add rows in Parent Zone → Reward Settings. `claimReward` writes a `RewardRequest` (`rewardRequests:v1`) in `debit_pending`, spends `reward.cost` with reason `Reward request: {name}` and id `reward-debit:{uuid}`, then moves to `pending_approval`. A parent approves, denies (which refunds), or marks fulfilled. The PIN gate is the Parent Zone (`SecurePinLock`, key `vibe_parent_pin_state_v1`), not the shop and not the claim button.

**What is shown.** Sidebar “Token Ledger” shows `userTokens`. `TokenWallet` shows balance, today earned, today spent, and recent transactions, and it says “tokens.” Achievement Center says “Vibe Tokens” and lists reward costs. Shop header: “Spend tokens to customize your look,” with the balance beside a star icon colored `--token-color` (`#B45309` in the daylight palette). Homework dashboard receives `tokens`. Goals of category `points` compare against the same balance. Parent progress reports read `getTokenStats().totalEarned`.

**What is not a purchase system.** The repo has no Play Billing dependency, no product id, no RevenueCat, and no price. `TUTOR_CONFIG.rewards` is unused. `student_points` / `studentPoints` is a second number used by Data Management export, import, and reset. Reset sets that number to 0. Reset does not clear `vibetutor_token_ledger_v3`. The live balance the child sees is the ledger. Theme work must leave both stores alone.

**Install identity.** `secureClient.ts` keeps `vibetutor_installation_id` locally and sends it with Play Integrity so the server can store a hash for AI usage counters. There is no user account. The privacy policy (effective 2026-09-27, in `privacy-policy.html` and `public/privacy-policy.html`) says the app is for teens 13–17, is not directed to children under 13, stores most data on device, and does not sell data.

## 2. Proposed theme system

### 2.1 Theme record

Add one profile, stored on its own key, for example `theme_profile_v1` in the same `user_settings` / `appStore` channel as other preferences. Keep it out of the token ledger, out of `avatarState`, and out of `SensoryPreferences`.

```ts
type ThemeId = 'gamer' | 'positivity' | 'blocky';

interface ThemeProfile {
  version: 1;
  activeThemeId: ThemeId;
  freeSelectionAvailable: boolean;
  weekStart: string;            // local Monday, YYYY-MM-DD
  freeSwitchUsed: boolean;
  purchasedCredits: number;     // extra switches already paid for and not yet used
  pendingCredit: null | { operationId: string; cost: number; createdAt: number };
  lastSwitchAt: number | null;
  history: Array<{
    at: number;
    fromThemeId: ThemeId;
    toThemeId: ThemeId;
    fromAvatarId: string;
    toAvatarId: string;
    via: 'initial' | 'weekly' | 'credit' | 'parent';
  }>;
}
```

`activeThemeId` is the palette and the content pack. `avatarState.selectedAvatarId` stays the face. A committed change of either one counts as a switch, because otherwise a child could rotate faces inside one theme and skip the limit. Shop gear (hat, shirt, frame, badge, background) does not count.

Sensory `colorMode`, font size, dyslexia font, animation, sound, and haptics stay exactly as they are and override theme colors wherever they already override `:root`.

### 2.2 Tokens

A theme is a bag of presentation tokens, applied by setting one attribute such as `data-companion-theme="gamer"` on `<html>`. Each theme defines the same keys the shell already uses: background, card, surface, primary, secondary, tertiary, text, border, token-color, and a display name plus icon for the currency. Game screens that hardcode purple and cyan stay as they are in the gamer theme. Later themes can restyle them only by replacing those hardcoded classes with the shared tokens, in a phase that has visual snapshots. Until that phase, gamer must keep the current class names.

`gamer` is a snapshot of today’s rendered product: daylight shell from `theme.css`, current game-screen colors, Focus Gamer available, current shop and wallet layout. It is not a revival of the unused `roblox-gaming` config, and it is not the unused `data-theme='dark'` block. Shipping a brighter neon shell would be a visual change for everyone who has the app now.

`positivity` is the new default pack: warm light surfaces, a friendly display face, and the content module in section 4. It uses the same component tree.

`blocky` is a later original “blocky builder” pack: chunky shapes, bright primary colors, original characters. It does not use Roblox’s name, logo, font, characters, or item names.

### 2.3 Avatar-to-theme map

The map is a suggestion used at selection time. It is not a live binding that recolors the app whenever `selectedAvatarId` changes under the hood.

| Avatar | Suggested theme | When it applies |
| --- | --- | --- |
| Focus Gamer (`avatar-boy-headphones`) | `gamer` | On a committed switch, or when a new student picks this face |
| Science Star, Street Scholar, Neon Thinker, AI Buddy, Calm Reader | `gamer` until the owner assigns otherwise | Same. Existing saves stay `gamer` even if a later map changes |
| New positivity companion (new id, new original art) | `positivity` | New installs and later switches |
| New blocky companion (new id, new original art) | `blocky` | Only after that art and palette exist |

Equipping Focus Gamer on an existing save during migration does not run this map. Migration writes `activeThemeId: 'gamer'` and leaves the saved face alone.

### 2.4 Who gets which default

**Existing install.** If `theme_profile_v1` is missing and any durable app data already exists (`onboarding_completed`, `avatarState`, the token ledger, homework, `user_name`, rewards, or the parent PIN), write a profile with `activeThemeId: 'gamer'`, `freeSelectionAvailable: true`, `freeSwitchUsed: false`, `purchasedCredits: 0`. Do this once, in the same startup path that already opens storage. Do not change avatar, tokens, rewards, sensory settings, or copy.

**Brand-new install.** No durable app data and no profile: the profile is born as `positivity`, with `freeSelectionAvailable: true`. The shell uses the positivity tokens. The first committed avatar choice, including keeping the starter face, is recorded `via: 'initial'` and sets `freeSelectionAvailable` to false. It does not set `freeSwitchUsed`. A student who picks Focus Gamer on that first choice moves to `gamer` for free.

**Reopening onboarding.** Today, finishing onboarding always pays the welcome 25 tokens under a fixed operation id, so a second finish is a duplicate earn and does not pay again. Theme work must keep that. Reopening onboarding must not reset the theme profile, must not grant another free initial choice, and must not clear switch history.

### 2.5 What a theme may change on the economy

The ledger key, the version-3 shape, every earn amount, every existing operation id, shop prices, reward `cost`, chore `rewardTokens`, and the parent approve/deny/refund flow stay identical across themes.

A theme may change only the words and the icon around that number: “tokens” can read as “stars” or “blocks” on screen, and the coin glyph can change, as long as the digits, the transaction reasons stored in the ledger, and the parent catalog’s stored `name` and `cost` stay put. Stored reasons stay plain (“Homework completed”, “Bought Mathematician’s Cap”) so an export written under one theme still makes sense under another.

## 3. Switching limit

Unlimited swapping fights the reason a companion exists for this audience: a predictable face and room. The limit is on how often the companion changes, not on which companions exist. Every shipped theme stays on the device. Nothing in the picker is sold as a locked character.

### 3.1 Recommended default

One free committed change per local calendar week, week starting Monday 00:00 in the device timezone. An unused week does not roll over, so there is nothing to hoard. The picker always shows a date in plain language, including before the limit is hit: “You can choose a new companion any time this week” or “Your next free change is Monday, November 2.” Use a date, not a ticking countdown.

The first committed choice does not use that weekly change:

- Existing users keep `gamer` and still have `freeSelectionAvailable`. Confirming gamer, or moving to positivity or blocky, is `via: 'initial'`.
- New users spend `freeSelectionAvailable` on the onboarding choice, even when that choice stays on positivity.

After that, a committed change with `freeSwitchUsed === false` sets the flag, stamps `weekStart` to the current Monday, and is `via: 'weekly'`. Further committed changes in that same week require a purchased credit or a parent override. On the next Monday, `freeSwitchUsed` becomes false again even if the app was closed the whole week. Compute “is this still the same week?” from `weekStart` and today’s local date at read time, so a clock change across midnight is the thing that restores the free change, not a background timer.

Previewing a theme does not write the profile and does not spend a change. Closing the picker returns to the saved companion.

Gear equip and unequip stay free and unlimited.

### 3.2 When a change is blocked

The blocked screen is a normal card, in the same voice as the rest of the app, with three facts and three actions of equal visual weight:

1. The companion they have now stays.
2. The date of the next free change.
3. Actions: wait until that date, ask a parent (opens the existing Parent Zone PIN), and, only if the owner turns it on, use tokens for one extra change.

Avoid red error styling, shaking buttons, “last chance,” “don’t lose your streak,” scarcity on the avatar itself, or a timer. If the token option is visible and the balance is short, say the balance and the price, and say that waiting still works. The wait path is always available and is never disabled to push a spend.

Parent override (`via: 'parent'`) applies the chosen avatar and theme, does not flip `freeSwitchUsed`, does not decrement `purchasedCredits`, and does not call `spendTokens`. The child-facing line is “A parent changed your companion.” The parent unlock is the PIN that already guards Parent Zone. If no PIN exists yet, the override goes through the same PIN-create step `SecurePinLock` already uses, then the change. The override is a settings action inside the unlocked Parent Zone, not a button on the child’s blocked card that skips the PIN.

### 3.3 Where the limit is stored, and what clearing data does

Store the profile in SQLite `user_settings` on Android and in the same `appStore` record elsewhere, and include it in the Data Management export/import pair so a file the family already keeps can restore it. That survives process death and device restart.

It does not survive “clear storage” or uninstall. The privacy policy already tells families that Android clear-storage wipes local data, including the installation id. A new install after that looks like a new install: positivity default, a fresh free initial choice, empty ledger. Tying the counter to the server-side installation hash would survive a local wipe only until the id is deleted, which clear-storage already deletes, and it would be a new off-device record of a minor’s behavior. This app has no accounts. The recommendation is to keep the switch profile on device and to say so in the privacy policy when the feature ships.

In-app Reset today clears homework, the legacy achievements table, the achievement lifecycle, `student_points`, the reward catalog, and sensory preferences. It does not clear the token ledger, avatar state, chat, schedules, or the installation id. The switch profile should follow the token ledger and the avatar: Reset leaves it in place. Wiping the limit while leaving the avatar would let Reset become the bypass. Document that in the Reset confirmation when the feature ships, so the sentence matches the behavior.

Parent override remains the supported way past the limit. A purchased credit is the other supported way. Clearing storage is a real bypass with a real cost (the child loses homework, tokens, and chat). Closing that hole needs an account or a server record. That is a product and privacy decision, listed in the open questions, and it is out of scope for the first implementation.

### 3.4 Tests to add when the feature is built

There is no unit-test runner in `package.json` today (`lint` is `tsc --noEmit`). The implementation phase should add a small test file around pure functions for the profile, with storage mocked. Cases:

- Missing profile plus existing avatar or ledger migrates to `gamer` with `freeSelectionAvailable` true and does not write the token ledger.
- Empty storage creates positivity and does not write a gamer profile.
- Initial choice, including choosing the theme already active, clears `freeSelectionAvailable` and leaves `freeSwitchUsed` false.
- Second committed change in the same local week is rejected, profile unchanged, ledger unchanged.
- The same change on the next local Monday is accepted and consumes that week.
- A change that only swaps hat or badge does not touch the profile.
- Preview does not write.
- Parent override changes the theme and leaves `freeSwitchUsed`, `purchasedCredits`, and the ledger untouched.
- Credit purchase: pending intent, then a confirmed spend, then `purchasedCredits === 1`. A retry with the same operation id does not spend twice and does not add a second credit. A failed spend leaves credits at 0 and leaves a retryable pending intent.
- Spending a credit applies the theme, decrements the credit, and does not consume the weekly free change.
- Insufficient balance does not change the profile.
- Import of a profile round-trips the fields and does not import a forged balance into the token ledger.
- Sensory high-contrast still sets `data-color-mode` after a theme apply.

## 4. Buying an extra switch

People will want another change before Monday. Three ways to allow that:

### Option A — spend tokens the child already has

Add one spend, through the existing `spendTokens` function, with a new reason such as `Theme switch credit` and a new operation id `theme-switch-credit:{uuid}`. Price is a positive safe integer. The flow copies the shop: write `pendingCredit` on the theme profile first, call `spendTokens`, and only then increment `purchasedCredits`. The ledger code, earn table, shop prices, and reward requests stay as they are. This is a new way to spend, not a new currency and not a change to amounts already earned.

The screen must say “tokens,” or whatever display name the active theme uses for the same balance, and it must not say “buy” in a way that sounds like real money. The Families policy (see section 7) requires a clear difference between virtual coins and real money when children are part of the audience.

Recommended starting price, for the owner to confirm: **50 tokens**. That is five completed homework items, or one focus session of 50 minutes, and it is below the cheapest shop hat (100). Cap unused credits at **2**, so a large balance cannot be converted into a long chain of identity changes in one afternoon. Credits do not expire. They are not refunded by switching themes, because the credit is what allows the switch.

### Option B — parent-paid real money

This app does not sell anything for money. There is no billing library, no in-app product, and no price in the client. A real-money switch would be new scope:

- Google Play’s payments policy requires Play Billing for digital goods in a Play-distributed app. That means the Play Billing library, a one-time consumable product created in Play Console, purchase acknowledgement, and restore behavior.
- The child’s entry point needs a parent gate before any price is shown. The Parent Zone PIN is the gate this app already has. Play’s family purchase-approval is a second gate on the Google account, and it only helps if the device is in a family group with approvals on. The in-app PIN still has to run first, so a child never meets a price sheet alone.
- Data safety and the privacy policy have to mention purchases. Play Billing is processed by Google. The app should store a purchase token only as long as needed to grant the credit, and it should not send that token to the tutor backend.
- Copy on the child side cannot pressure: no “only $0.99,” no sadness when they decline, no limited-time price, no character looking disappointed. The child-facing path can say a parent can allow an extra change. The price belongs on the parent side of the PIN.
- If the Play target audience includes children, the Families ads and monetization rules apply to offers for in-app purchases, including a ban on emotionally manipulative tactics and a requirement to distinguish virtual currency from real money. The current privacy policy says the app is for ages 13–17 and is not directed to children under 13. A younger audience, or store screenshots that read as for younger children, can change which rules Google applies. That decision is the owner’s, and it is separate from this plan’s default.
- The repo’s release rule is to add Play Billing only when the product being built is a paid or billed product. A theme switch is not that product unless the owner explicitly chooses option B or C.

### Option C — both

Tokens for the child who has earned them, and a parent-paid Play product that grants the same credit. This needs every control from A and every billing, disclosure, and parental-gate control from B. It is the largest policy surface, and it is easy to get the two prices confused on one screen.

### Recommendation

Ship **option A only**, behind the weekly free change and the parent override, so a child who never spends tokens still gets a companion and still gets one change a week. Leave the price and the credit cap as owner decisions, with 50 tokens and a cap of 2 as the proposed numbers. Revisit real money only in its own release, after the owner accepts Play Billing, a parent-only price screen, and a privacy-policy update. Do not put a cash price in the child UI in the first version.

This plan does not change economy code or purchase code.

## 5. Positivity content model

New copy lives in a data module the positivity theme reads. The gamer theme keeps today’s Wellness Hub lines until a later phase decides whether that hub becomes theme-aware. The gamer snapshot includes the current hub, so the first positivity release can add a module without rewriting the hub that existing users see.

Each item:

```ts
interface CompanionNote {
  id: string;
  kind: 'affirmation' | 'health' | 'body' | 'esteem' | 'spirit';
  text: string;
  reflection?: string;
  spirit: boolean;          // true only for the optional spiritual set
  minAge: 13;               // matches the published age scope until the owner changes it
  reviewStatus: 'draft' | 'approved';
}
```

Rules for the writer:

- Affirmations stay in the voice of the current set: effort, belonging, and “my brain works differently,” short enough to read aloud.
- Health notes are ordinary habits: water, sleep, movement, sunlight, a snack. They are ideas, not instructions for a condition.
- Body notes talk about energy, rest, and what the body did today. They skip weight, calories, body shape, and comparison.
- Esteem notes praise trying, asking for help, and specific effort. They skip “you are the best” and ranking against other kids.
- Spiritual notes ship behind a parent toggle that defaults to off. With the toggle off, the picker never chooses `spirit: true`. With it on, the lines are non-denominational: gratitude, being kind, quiet, hope. They do not name a deity, quote scripture, or say one religion is true. The Bible worksheet bank stays in school subjects and is not pulled into this pack.
- No note claims to treat, diagnose, or prevent anxiety, depression, ADHD, autism, or any other condition. The current file header in `dailyAffirmations.ts` should be rewritten when that module is next edited, so the app does not describe itself as CBT that reduces psychiatric symptoms.
- One note per local day, stable for that date, same idea as `getDailyAffirmation`. A child can ask for a different line from the same allowed set. That refresh does not change the companion and does not cost a switch.

### Content-review checklist

Before a line is marked `approved`:

1. A parent (the owner, until someone else is named) has read it out loud.
2. It is concrete and kind, and it still sounds kind on a hard day.
3. It does not give medical, diet, or mental-health instructions, and it does not promise an outcome.
4. Spiritual lines are off unless the parent toggle is on, and they are non-denominational.
5. It does not mention brands, including Roblox, and it does not use another person’s character.
6. It fits ages 13–17 as the app is currently published. If the audience expands younger, the set is reviewed again.
7. The mood check-in stays optional. Skipping it still lets the child do homework.
8. Stored reflections stay on device. The plan does not send note text or mood to the tutor backend.

## 6. Music findings

The current list is a hobby-radio mix: anime, several SomaFM electronic and ambient channels, one classical station, one “gaming” station that is actually a sci-fi soundtrack channel, and indie/80s variety. That overlaps some real teen tastes (electronic, pop-adjacent indie, anime) and misses others that surveys put at the top (pop, hip-hop/rap, R&B). It also presents every station as equal, with no split between “music while reading” and “music for a break,” and with no warning on streams that can be lyrically dense or sonically harsh (DEF CON Radio’s identity is a hacker-conference brand; Drone Zone is a low, continuous texture that some listeners like and some find unsettling).

What the sources support, and where they stop:

- A meta-analysis of background music in adults found no single overall effect. Split by task, music had a small negative relationship with reading (weighted mean r about −0.11 across eight studies) and a small negative relationship with other memory tasks, and a more positive relationship with emotion and with sports (Kämpfe, Sedlmeier, and Renkewitz, *Psychology of Music*, 2011, https://doi.org/10.1177/0305735610376261). Those were mostly adult studies. They do not prove that a particular SomaFM channel helps or hurts a teen’s homework.
- In college students, music with lyrics hurt verbal memory, visual memory, and reading comprehension (effects around d = −0.3). Instrumental lo-fi hip-hop did not show a credible help or harm on those tasks. Students sometimes believed the instrumental music was helping (Souza and Barbosa, *Journal of Cognition*, 2023, https://doi.org/10.5334/joc.273). This is a reason to offer an instrumental “while you study” shelf. It is not proof that instrumental music improves learning.
- A meta-analysis of the “Mozart effect” found a small, temporary bump on spatial tasks and no support for a general intelligence or learning boost from listening to Mozart (Pietschnig, Voracek, and Formann, *Intelligence*, 2010, https://doi.org/10.1016/j.intell.2010.03.006). WQXR can stay because some listeners like classical music, not because it makes homework easier.
- Young adults screened for ADHD symptoms reported listening to background music more while studying, and a stronger preference for stimulating music, than a comparison group. Across both groups, more people preferred relaxing, instrumental, familiar, self-chosen music during harder cognitive tasks, and stimulating music with lyrics during easier tasks (Lachance, Pelland-Goulet, and Gosselin, *Frontiers in Psychology*, 2025, https://doi.org/10.3389/fpsyg.2024.1508181). The sample was ages 17–30, not children, and the outcomes were self-report. Preference and familiarity show up more clearly than any one genre.
- Autistic adolescents in one questionnaire study had had more childhood sound sensitivity than peers, and later musical interest was still broad. A larger share named classical as a favorite; tastes were otherwise individual (Bhatara, Quintin, and colleagues, *Psychomusicology*, 2013, https://doi.org/10.1037/a0033754). A 2022 review of music studies in autism (Applewhite, Cankaya, Heiderscheit, and Himmerich, *International Journal of Environmental Research and Public Health*, https://doi.org/10.3390/ijerph19095150) describes music used for mood and personal reasons, and stronger responses to music a person already prefers. The same review discusses music-therapy interventions and says most of those studies were small and few were randomized trials. That is not evidence this radio player is therapy, and it is not a reason to assign a genre. It is a reason to keep a volume control, a predictable station, and a real off switch.
- IFPI’s *Engaging with Music 2023* (ages 16–64, online population) ranks favorite genres globally as pop, rock, hip-hop/rap, dance/electronic, Latin, then R&B, with classical further down (https://www.ifpi.org/wp-content/uploads/2023/12/IFPI-Engaging-With-Music-2023_full-report.pdf). It is not a neurodivergent sample and it is not ages 10–15. It is a reasonable check on what “teens like” usually means in the wider population: the app’s catalog is thin on pop and hip-hop.

Recommendation for a later music change, not for this pull request:

1. Split the screen into “While you study” and “For a break,” in that order. Study shelf: instrumental or very low-lyric, steady, and already on the list where the license allows it (Groove Salad, Space Station, WQXR, Sonic Universe if the owner still wants a game-score option). Break shelf: Beat Blender, Indie Pop, Underground 80s, LISTEN.moe, Cliq Hop.
2. Let the child mark a small set of favorites. The research that exists keeps pointing at self-chosen and familiar music more than at a house genre.
3. Keep the off control obvious, and keep honoring the sensory sound setting for UI sounds. Add a one-line note that a station can be stopped if it feels like too much. Do not call the player therapy, focus treatment, or ADHD support.
4. Drop or relabel DEF CON Radio unless the owner wants that name on a teen homework screen. The stream is electronic music; the brand is a security conference.
5. Before adding pop or hip-hop streams, check the station’s terms and whether lyrics are appropriate for the published 13–17 scope. Commercial streams (Spotify, YouTube) bring accounts, recommendations, and ads. The unused playlist types should stay unused unless those issues are designed on purpose.
6. Confirm SomaFM, LISTEN.moe, and WQXR allow in-app playback, and keep the privacy-policy sentence that names those hosts accurate if the list changes.

Uncertainty to leave in the UI and in release notes: nothing in this catalog is proven to help neurodivergent students learn. Some listening is linked with slightly worse reading in adult studies, especially with lyrics. Some teens, including teens with attention difficulties, like having music on anyway. The honest product is a player they can choose and can stop.

## 7. Licensing, Play, and data

- Do not ship Roblox logos, the Roblox wordmark, Roblox characters, catalog item names, or “oof” / badge sounds as theme assets. The blocky theme is original art of blocky people in original worlds. `TUTOR_CONFIG` still contains Roblox reward names and “roblox-oof” sound ids, and those strings are currently unused. Before any theme reads that file, those strings come out of the user-facing path. This plan does not edit the file, so today’s behavior stays.
- Avatar PNGs stay the current six files for the gamer option. New faces are new files drawn for this app. `PLACEHOLDER.md` is an art spec, not a license for third-party characters.
- Google Play Families policy (https://support.google.com/googleplay/android-developer/answer/9893335) applies based on the target audience in Play Console and on whether the app’s own imagery reads as child-directed. The published privacy policy says 13–17 and not under 13. If the owner wants younger children, the audience declaration, the privacy policy, and this content set all change together. Theme imagery of a young gamer or a blocky child can affect how Play reads the audience.
- Families monetization rules ban emotionally manipulative in-app purchase offers and require a visible difference between virtual currency and real money. Option A has to use that difference in copy. Option B has to go through Play Billing (https://support.google.com/googleplay/android-developer/answer/9858738) and a parent gate.
- Data safety and the privacy policy, when the feature ships, need to mention on-device storage of the theme id, switch history, optional spiritual toggle, and (if option A ships) the same token ledger already described. They need a new sentence only if any of that leaves the device. The recommendation is that it does not. Mood and reflection text already stay in `daily_affirmations` on device; new notes should follow that pattern and, unlike today’s affirmation history, should use the same durable store as other preferences so Android clear-storage and export behave predictably. Moving the existing affirmation key is a behavior change and belongs in the implementation phase, with a migration of the old `localStorage` value.
- This pull request does not edit the privacy policy, the store listing, keystores, or release config.

## 8. Regression safety

Before any implementation phase is called done:

**Economy, on a build that can persist.** Record the ledger JSON. Earn one homework completion (+10, same operation id does not pay twice). Earn one focus session and confirm the amount equals the minutes. Spend a shop item and confirm `balance` drops by `item.cost` and `pendingPurchase` clears. Claim a parent reward, deny it, and confirm the refund operation id restores the same amount. Switch theme, kill the process, relaunch: balance, `totalEarned`, `totalSpent`, and transaction ids match the pre-switch ledger. Migrate a copy of a v3 ledger and confirm the bytes of that key are unchanged by theme migration. Repeat with a v2-shaped legacy record on a throwaway profile and confirm the existing v2→v3 migration still runs and is not rewritten by the theme profile.

**Theme migration.** A profile with an avatar and a ledger and no `theme_profile_v1` opens on today’s colors, with Focus Gamer or whichever face was saved still selected. A profile with no data opens on positivity. Sensory high-contrast, warm, cool, dyslexia font, and reduced motion still apply on both themes.

**Switch limit.** The cases in section 3.4, plus a manual pass: blocked card shows a date, the companion on screen does not change, Parent Zone PIN can apply a change, and a token purchase cannot run twice from a double tap.

**Visual.** Screenshot the dashboard, shop, wallet, wellness hub, music list, and one Brain Gym game on the gamer theme and compare to the same screens on the build before the theme work. Gamer should match. Positivity is allowed to differ. Game screens stay as they are until the phase that opts them into tokens.

**Music.** This plan does not change stations. When a later phase does, play and stop one station in each shelf and confirm the sensory sound toggle still mutes UI effects only, unless that phase deliberately wires the two together.

**Out of scope for snapshots.** Store listing, privacy HTML, and billing, until the phase that changes them.

## 9. Phased rollout

1. **This pull request.** Plan only.
2. **Profile and gamer snapshot.** Add the profile type, the migration that writes `gamer` for existing data, and `data-companion-theme=gamer` pointing at the current CSS variables. No new colors, no picker, no spend. Existing and new installs still look the same, because positivity is not applied yet. Tests from section 3.4 that cover migration only.
3. **Positivity for empty installs.** New palette, new notes module with the spiritual toggle defaulting off, empty-install default. Existing profiles stay gamer. Picker can show both themes. Weekly limit and initial-choice rule turn on here.
4. **Token credit.** Option A, price confirmed by the owner, pending-intent flow, cap. Still no Play Billing.
5. **Blocky theme.** Only after original art exists. Map the new avatar. No trademark assets.
6. **Music shelves.** Relabel and regroup stations, license check, copy pass. No clinical claims.
7. **Optional later.** Real-money credit, only if the owner accepts section 4 option B. Server-side switch record, only if the owner accepts the privacy cost in section 3.3.

Each phase after this one gets its own branch and its own check of the ledger. None of them rewrite token history.

## 10. Open questions for the owner

1. **Gamer means today’s look.** The shell is the calm daylight palette, and Brain Gym is still neon. The unused `roblox-gaming` config is not on screen. Confirm that “keep the gamer theme” means freeze this rendered product, Focus Gamer included, rather than painting the shell neon again.
2. **Switch cadence.** Recommended default: one free committed change per local week (Monday), plus one free initial choice that does not use that week, plus a parent PIN override that does not use it either. Is Monday the right boundary, and is one the right number?
3. **Extra switches.** Recommended default: token spend only, at 50 tokens, maximum 2 unused credits, no real-money product. What price do you want, and do you want a Play Billing product at all?
4. **Audience age.** The privacy policy says 13–17 and not under 13. The product is described as for kids and teens. Which ages should the new copy and the Play target audience use? Younger ages change Families rules, spiritual copy, and music lyrics.
5. **Spiritual toggle.** Recommended default: off, non-denominational, no scripture, parent-controlled. Do you want a specifically Christian pack later, kept separate from the default?
6. **Blocky art.** Who draws the original blocky companion, and is “blocky builder” an acceptable public name so the UI never says Roblox?
7. **Clear-storage bypass.** Recommended default: accept that clearing app storage resets the switch limit, because the app has no accounts and the current privacy policy treats clear-storage as a full local delete. Do you want a later account or server record instead?
8. **Music.** Is the study-shelf / break-shelf split right, and should DEF CON Radio leave the list? Should pop or hip-hop be added once a licensed stream is found?
9. **Wellness Hub.** Should positivity replace the hub’s daily line for everyone, or only when that theme is active, leaving the current lines in place for gamer?
10. **Reset App copy.** Reset currently zeros `student_points` and does not clear the token ledger. When the switch profile is added, Reset should keep the profile. Do you want the confirmation sentence updated in that same phase so it matches?

## 11. Sources

- Kämpfe, J., Sedlmeier, P., & Renkewitz, F. (2011). The impact of background music on adult listeners: A meta-analysis. *Psychology of Music*. https://doi.org/10.1177/0305735610376261
- Souza, A. S., & Barbosa, L. C. L. (2023). Should we turn off the music? Music with lyrics interferes with cognitive tasks. *Journal of Cognition*. https://doi.org/10.5334/joc.273
- Pietschnig, J., Voracek, M., & Formann, A. K. (2010). Mozart effect–Shmozart effect: A meta-analysis. *Intelligence*. https://doi.org/10.1016/j.intell.2010.03.006
- Lachance, K.-A., Pelland-Goulet, P., & Gosselin, N. (2025). Listening habits and subjective effects of background music in young adults with and without ADHD. *Frontiers in Psychology*. https://doi.org/10.3389/fpsyg.2024.1508181
- Bhatara, A., Quintin, E.-M., Fombonne, E., & Levitin, D. J. (2013). Early sensitivity to sound and musical preferences and enjoyment in adolescents with autism spectrum disorders. *Psychomusicology: Music, Mind, and Brain*. https://doi.org/10.1037/a0033754
- Applewhite, B., Cankaya, Z., Heiderscheit, A., & Himmerich, H. (2022). A systematic review of scientific studies on the effects of music in people with or at risk for autism spectrum disorder. *International Journal of Environmental Research and Public Health*. https://doi.org/10.3390/ijerph19095150
- IFPI. (2023). *Engaging with Music 2023*. https://www.ifpi.org/wp-content/uploads/2023/12/IFPI-Engaging-With-Music-2023_full-report.pdf
- Google Play Families policies. https://support.google.com/googleplay/android-developer/answer/9893335
- Google Play payments policy. https://support.google.com/googleplay/android-developer/answer/9858738
- Google Play purchase approvals. https://support.google.com/googleplay/answer/7039872
