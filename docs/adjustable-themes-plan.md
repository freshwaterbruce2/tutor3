# Adjustable themes plan

This document is the plan and safe groundwork for letting a child pick a companion avatar that brings its own visual theme, while a new positivity theme becomes the default for new installs only. It records how the app works today, the proposed design, music evidence, policy risks, and the checks a later implementation must pass.

This pull request adds this document only. It does not change theme rendering, avatars, onboarding, music, tokens, rewards, purchases, storage, or store-listing copy. After it merges, the app should behave the same as it does now.

Owner decisions recorded on 2026-10-27:

- **Gamer theme** means freeze the product as it renders today: daylight shell, neon game screens, Focus Gamer. Do not repaint the shell neon from the unused `roblox-gaming` config.
- **Switch limit** is one free committed change per local week starting Monday, plus one free first choice that does not use that week, plus a parent PIN override that does not use it either.
- **App price.** A $4.99 one-time fee for the app is too low and will lose money. The owner wants either a subscription with a lower entry price, or the one-time purchase kept and paired with in-app purchases. Section 4 compares those and recommends a parent-gated subscription for the cloud tutor, with token spending and optional IAP kept separate from that bill. No price is implemented in this pull request. The repo still has no Play Billing product.
- **No accounts.** Do not create accounts to enforce the switch limit. Clearing app storage may reset that limit. That tradeoff is accepted.
- **Music shelves.** Yes to a study shelf and a break shelf, and yes to removing DEF CON Radio. Where the studies disagree, the player offers a choice and does not claim a station is proven to help. K-LOVE is wanted and is blocked until Educational Media Foundation gives written permission. It is not the sound of the spiritual theme.
- **Themes are cosmetic.** A positivity theme changes colors, backgrounds, and other UI chrome. It does not add, remove, or replace features. Wellness, music, homework, games, and the token shop stay available on every theme.
- **Reset copy.** Yes. When the switch profile ships, the Reset App confirmation is updated so it matches what Reset actually clears and what it keeps.
- **Audience.** Youngest age stays 13. The range stays teens 13–17, matching the privacy policy already published. Do not add ages 11–12. Play target groups stay Ages 13–15 and Ages 16–17.
- **Spiritual pack.** Prefer spiritual, not a Christian pack. One parent switch, default off, public name Steady Light. It adds a cosmetic theme and an optional quiet line. It does not change features, earning, or which theme a new install starts on. No scripture, no named deity, and no claim that it improves homework.

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
type ThemeId = 'gamer' | 'positivity' | 'blocky' | 'spiritual';

interface ThemeProfile {
  version: 1;
  activeThemeId: ThemeId;
  spiritualPackEnabled: boolean; // parent PIN only; default false; turning it on is not a switch
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

`activeThemeId` is the palette. `avatarState.selectedAvatarId` stays the face. A committed change of either one counts as a switch, because otherwise a child could rotate faces inside one theme and skip the limit. Shop gear (hat, shirt, frame, badge, background) does not count. `spiritualPackEnabled` is a parent setting. Flipping it does not change `activeThemeId` and does not use a weekly switch.

Sensory `colorMode`, font size, dyslexia font, animation, sound, and haptics stay exactly as they are and override theme colors wherever they already override `:root`.

### 2.2 Tokens

A theme is cosmetic. It changes colors, backgrounds, cards, and the currency’s on-screen name and icon. It does not turn features on or off. Homework, focus, games, the shop, rewards, music, and the Wellness Hub stay on every theme, with the same actions and the same saved data. The positivity pack does not replace the hub’s lines, hide a station, or change earning rules.

A theme is applied by setting one attribute such as `data-companion-theme="gamer"` on `<html>`. Each theme defines the same keys the shell already uses: background, card, surface, primary, secondary, tertiary, text, border, token-color, and a display name plus icon for the currency. Game screens that hardcode purple and cyan stay as they are in the gamer theme. Later themes can restyle them only by replacing those hardcoded classes with the shared tokens, in a phase that has visual snapshots. Until that phase, gamer must keep the current class names.

`gamer` is a snapshot of today’s rendered product: daylight shell from `theme.css`, current game-screen colors, Focus Gamer available, current shop and wallet layout. It is not a revival of the unused `roblox-gaming` config, and it is not the unused `data-theme='dark'` block. Shipping a brighter neon shell would be a visual change for everyone who has the app now.

`positivity` is the new default look: warm light surfaces and the same screens as gamer. It does not bring its own affirmations.

`blocky` is a later original “blocky builder” pack: chunky shapes, bright primary colors, original characters. It does not use Roblox’s name, logo, font, characters, or item names.

`spiritual` is Steady Light, described in section 2.6. It is hidden until a parent turns the pack on. New installs still start on `positivity`.

### 2.3 Avatar-to-theme map

The map is a suggestion used at selection time. It is not a live binding that recolors the app whenever `selectedAvatarId` changes under the hood.

| Avatar | Suggested theme | When it applies |
| --- | --- | --- |
| Focus Gamer (`avatar-boy-headphones`) | `gamer` | On a committed switch, or when a new student picks this face |
| Science Star, Street Scholar, Neon Thinker, AI Buddy, Calm Reader | `gamer` until the owner assigns otherwise | Same. Existing saves stay `gamer` even if a later map changes |
| New positivity companion (new id, new original art) | `positivity` | New installs and later switches |
| New blocky companion (new id, new original art) | `blocky` | Only after that art and palette exist |
| None of the current six | `spiritual` | Not suggested by an existing face. The Steady Light row appears in the picker only while the parent pack is on |

Equipping Focus Gamer on an existing save during migration does not run this map. Migration writes `activeThemeId: 'gamer'` and leaves the saved face alone.

### 2.4 Who gets which default

**Existing install.** If `theme_profile_v1` is missing and any durable app data already exists (`onboarding_completed`, `avatarState`, the token ledger, homework, `user_name`, rewards, or the parent PIN), write a profile with `activeThemeId: 'gamer'`, `spiritualPackEnabled: false`, `freeSelectionAvailable: true`, `freeSwitchUsed: false`, `purchasedCredits: 0`. Do this once, in the same startup path that already opens storage. Do not change avatar, tokens, rewards, sensory settings, or copy.

**Brand-new install.** No durable app data and no profile: the profile is born as `positivity`, with `spiritualPackEnabled: false` and `freeSelectionAvailable: true`. The shell uses the positivity tokens. The first committed avatar choice, including keeping the starter face, is recorded `via: 'initial'` and sets `freeSelectionAvailable` to false. It does not set `freeSwitchUsed`. A student who picks Focus Gamer on that first choice moves to `gamer` for free. Steady Light is not on that first screen unless a parent has already enabled the pack.

**Reopening onboarding.** Today, finishing onboarding always pays the welcome 25 tokens under a fixed operation id, so a second finish is a duplicate earn and does not pay again. Theme work must keep that. Reopening onboarding must not reset the theme profile, must not grant another free initial choice, and must not clear switch history.

### 2.5 What a theme may change on the economy

The ledger key, the version-3 shape, every earn amount, every existing operation id, shop prices, reward `cost`, chore `rewardTokens`, and the parent approve/deny/refund flow stay identical across themes.

A theme may change only the words and the icon around that number: “tokens” can read as “stars” or “blocks” on screen, and the coin glyph can change, as long as the digits, the transaction reasons stored in the ledger, and the parent catalog’s stored `name` and `cost` stay put. Stored reasons stay plain (“Homework completed”, “Bought Mathematician’s Cap”) so an export written under one theme still makes sense under another. Steady Light may use a small circle of warm light as the icon. It may not use a cross, a dove, or any other religious mark, and it may not change the number.

### 2.6 Steady Light

The owner asked for a spiritual content pack rather than a Christian one, and for a beautiful front end to go with it. Studies in section 6 do not show that spiritual copy or any radio station improves homework, so this pack is a preference. It is off until a parent turns it on in Parent Zone, behind the existing PIN. The child cannot turn it on. Turning it on does not switch the current theme.

While it is off, the picker has no Steady Light row, and the hub never shows a quiet line. While it is on, two things become available:

- The cosmetic theme `spiritual`, public name **Steady Light**. Choosing it counts as a normal companion change (free first choice, weekly change, token credit, or parent PIN).
- One extra hub line, labeled “Quiet line,” drawn only from notes with `spirit: true`. The ordinary daily affirmation still shows on every theme. The quiet line is a second sentence, not a replacement. It can show on gamer, positivity, or blocky, so a child who likes those colors is not forced onto Steady Light to hear it.

Palette, all original CSS, no stock “heaven” photo:

| Token | Value | Use |
| --- | --- | --- |
| Page | `#F3EDE3` | Warm paper, not stark white |
| Card | `#FFF9F2` | Same cards as the other themes, this fill only |
| Primary | `#3E5C50` | Sage for buttons and links |
| Secondary | `#C4A36A` | Soft gold for a selected pill and the token icon only, never a large fill |
| Text | `#2A2622` | Warm near-black |
| Border | `#E4D8C8` | Hairline |
| Token color | `#8A6A32` | Same balance, new paint |

The page background is a low horizon and a soft wash of light at the top, drawn in CSS. No cross, dove, halo, angel, stained glass, or denomination mark. Corners and type stay the app’s current ones, so the screen does not change shape. No pulsing glow. Sensory high-contrast, warm, and cool still override these colors. Game screens keep their current classes until the shared-token phase; after that, Steady Light uses this sage and gold instead of purple neon.

Tone samples for the quiet line, drafts only, not shipped in this pull request: “There is a quiet place in this day, and you can come back to it.” “You are allowed to go slowly and still be on your way.” They do not name a deity, quote scripture, or say the line will help anyone focus. A Christian pack, including the word God and including K-LOVE, is not part of this version.

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

In-app Reset today clears homework, the legacy achievements table, the achievement lifecycle, `student_points`, the reward catalog, and sensory preferences. It does not clear the token ledger, avatar state, chat, schedules, or the installation id. The switch profile should follow the token ledger and the avatar: Reset leaves it in place, including `spiritualPackEnabled` and Steady Light if that theme is active. Wiping the limit while leaving the avatar would let Reset become the bypass. The owner asked for the Reset confirmation to be rewritten in that same phase so the sentence lists what is cleared and what stays, including the companion theme, the switch history, and the spiritual pack switch.

Parent override remains the supported way past the limit. A purchased credit is the other supported way. Clearing storage is a real bypass with a real cost (the child loses homework, tokens, and chat). The owner decided not to create accounts to close that hole. No server-side switch record.

### 3.4 Tests to add when the feature is built

There is no unit-test runner in `package.json` today (`lint` is `tsc --noEmit`). The implementation phase should add a small test file around pure functions for the profile, with storage mocked. Cases:

- Missing profile plus existing avatar or ledger migrates to `gamer` with `freeSelectionAvailable` true, `spiritualPackEnabled` false, and does not write the token ledger.
- Empty storage creates positivity and does not write a gamer profile.
- Initial choice, including choosing the theme already active, clears `freeSelectionAvailable` and leaves `freeSwitchUsed` false.
- Second committed change in the same local week is rejected, profile unchanged, ledger unchanged.
- The same change on the next local Monday is accepted and consumes that week.
- A change that only swaps hat or badge does not touch the profile.
- Preview does not write.
- Parent override changes the theme and leaves `freeSwitchUsed`, `purchasedCredits`, and the ledger untouched.
- Turning `spiritualPackEnabled` on or off leaves `activeThemeId`, `freeSwitchUsed`, and the ledger unchanged. While it is off, a write that sets `activeThemeId` to `spiritual` is rejected.
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
- The youngest age stays 13, so this billing release does not add children under 13 to the target audience. The parent PIN still comes before any price, and the screen still shows a visible difference between tokens and real money. The privacy policy already says ages 13–17 and not under 13. That sentence stays.
- The repo’s release rule is to add Play Billing only when the product being built is a paid or billed product. A theme switch is not that product unless the owner explicitly chooses option B or C.

### Option C — both

Tokens for the child who has earned them, and a parent-paid Play product that grants the same credit. This needs every control from A and every billing, disclosure, and parental-gate control from B. It is the largest policy surface, and it is easy to get the two prices confused on one screen.

### Recommendation for switches

Extra companion changes stay on **tokens** (50 tokens, cap of 2 unused credits) plus the weekly free change and the parent PIN override. A cash price for a theme switch is a poor way to fund the app: families will not buy switches often enough to cover the tutor, and a child-facing price for a face they love is the manipulative case the Families rules call out.

### App price: subscription or one-time plus IAP

The client does not contain a $4.99 product. Play Billing is not integrated. The cloud tutor is the cost that continues after install. `gatewayAdapter.ts` allows **30 AI replies a day and 200 a month** per installation. Homework, focus, games, the token shop, and the on-device study model do not use that meter. A one-time $4.99 unlock would pay once and then keep serving that allowance every month. That is the loss the owner is pointing at.

**Subscription, lower entry (recommended).**

Sell the cloud tutor as a Play subscription that a parent starts. The entry price is a monthly fee, lower than a corrected lifetime price would have to be, because it is charged again each period. An optional annual plan can cost less per month than twelve monthly payments. The price and the included allowance (whether 200/month stays the paid cap, or the paid plan raises it) are still owner numbers. This plan does not pick a dollar amount.

What stays free without the subscription: the homework list, focus timer, games, token earning and spending, parent rewards, and companion themes including the weekly free change. Stored homework remains on the device if the subscription lapses. The paid thing is more cloud tutor time, not the child’s companion and not the token balance.

The parent sees the price, the billing period, that it renews, and that cancellation is in Google Play, before the Play sheet opens. The existing Parent Zone PIN is that gate. Play family purchase approval is a second gate only when the device is in a family with approvals on, so the PIN still comes first. There is no trial a child can start. If a trial exists, the parent starts it on that same screen, and the price after the trial is written there. The child UI can say the tutor needs a parent to turn on more replies. It does not show a dollar figure, a countdown, or a sad avatar.

**One-time purchase plus IAP (the other option the owner named).**

“Keep the same” means keep a single paid unlock, then add in-app products. $4.99 is the price the owner already considers too low, so a one-time unlock that includes ongoing AI would need a higher price, and heavy months could still cost more than that single payment. Cosmetic IAP (extra theme switches, art packs) will not reliably cover the API. The IAP that would cover it is a time-boxed tutor pack, for example “tutor replies for this month,” which is a subscription with worse wording.

If this option is chosen anyway:

- The one-time product unlocks the non-AI app, or it is priced high enough that the owner accepts leftover AI risk. It does not include unlimited months of the 200-reply allowance at $4.99.
- Tutor access is a subscription or a monthly consumable, parent-gated, separate from the one-time price.
- Extra theme switches can be a second, optional consumable IAP, also parent-gated, and also available for 50 tokens so a child is not pushed at a cash button.
- The screen that shows both a dollar unlock and a token price has to say which number is real money and which is the in-app token balance. Families policy requires that distinction.

**What neither option may do.**

- Change earn amounts, shop prices, ledger keys, or parent reward costs. Real money does not add tokens unless a later, explicit decision says a parent can buy a token pack. That pack is not in this recommendation, because selling tokens to children is a separate Families risk.
- Put the price, the renewal, or “you will lose your companion” on the child side of the PIN.
- Turn off homework the family already saved when a payment fails.
- Ship billing in the theme pull requests. Billing is its own release, with Play Billing, Data safety, the privacy policy, and a store-listing note that the app now offers a subscription or IAP.

This plan does not change economy code or purchase code.

## 5. Positivity content model

The owner decided a positivity theme does not change features. It changes cosmetics: colors, backgrounds, and the rest of the UI chrome. The Wellness Hub, its daily line, the thought journal, and any later tips stay one feature on every theme. Positivity restyles that screen. It does not swap in a different hub, and gamer does not hide it.

If new affirmations, health notes, body notes, esteem lines, or optional spiritual lines are added later, they are added to that shared hub. The quiet line is the one exception that a parent can hide, and hiding it does not hide the hub. The checklist below is for that copy. It is not a theme switch. This pull request does not add the copy. Reading level for new lines is a teen of about 13, which is the youngest age in section 10.

Each item:

```ts
interface CompanionNote {
  id: string;
  kind: 'affirmation' | 'health' | 'body' | 'esteem' | 'spirit';
  text: string;
  reflection?: string;
  spirit: boolean;          // true only for the optional Steady Light quiet line
  minAge: 13;               // youngest age; matches the published 13–17 scope
  reviewStatus: 'draft' | 'approved';
}
```

Rules for the writer:

- Affirmations stay in the voice of the current set: effort, belonging, and “my brain works differently,” short enough to read aloud.
- Health notes are ordinary habits: water, sleep, movement, sunlight, a snack. They are ideas, not instructions for a condition.
- Body notes talk about energy, rest, and what the body did today. They skip weight, calories, body shape, and comparison.
- Esteem notes praise trying, asking for help, and specific effort. They skip “you are the best” and ranking against other kids.
- Spiritual notes ship behind the Steady Light parent switch, default off. With the switch off, the hub never chooses `spirit: true`. With it on, the quiet line is non-denominational: gratitude, being kind, quiet, hope. The lines do not name a deity, quote scripture, pray, or say one religion is true. They do not say a disability is a test, a lesson, or something to be fixed. The Bible worksheet bank stays in school subjects and is not pulled into this pack. There is no Christian pack in this version.
- No note claims to treat, diagnose, or prevent anxiety, depression, ADHD, autism, or any other condition. The current file header in `dailyAffirmations.ts` should be rewritten when that module is next edited, so the app does not describe itself as CBT that reduces psychiatric symptoms.
- One note per local day, stable for that date, same idea as `getDailyAffirmation`. A child can ask for a different line from the same allowed set. That refresh does not change the companion and does not cost a switch.

### Content-review checklist

Before a line is marked `approved`:

1. A parent (the owner, until someone else is named) has read it out loud.
2. It is concrete and kind, and it still sounds kind on a hard day.
3. It does not give medical, diet, or mental-health instructions, and it does not promise an outcome.
4. Spiritual lines are off unless the parent toggle is on, and they are non-denominational.
5. It does not mention brands, including Roblox, and it does not use another person’s character.
6. It fits ages 13–17, the published audience. It does not read as if it were written for a younger child.
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
- In preadolescents about age 10, one quasi-experiment found reading comprehension improved with background music in the ADHD group (calm instrumental, calm with lyrics, and rhythmic with lyrics were all tested) and got worse in the comparison group (Madjar, Gazoli, Manor, and Shoval, *Psychiatry Research*, 2020, https://doi.org/10.1016/j.psychres.2020.113207). The main sample was 25 children per group, after a pilot of 20. The authors did not claim one music type won. This disagrees with the adult lyrics finding above, so the app should not tell every child to study in silence or with lyrics.
- Boys aged about 10–12, with and without ADHD, made somewhat fewer errors on an attention-network test while music played. Reaction time did not change, and the ADHD group was not affected more than the other group (Mendes, de Paula, and Miranda, *Interactive Journal of Medical Research*, 2024, https://doi.org/10.2196/53869). The sample was boys only.
- A 2025 review of 20 ADHD-and-music studies (Saville, Kinney, Heiderscheit, and Himmerich, *Behavioral Sciences*, https://doi.org/10.3390/bs15010065) says most listening studies reported a benefit and that the studies disagree with each other on diagnosis, medication, and method. A 2023 review (Martin-Moratinos, Bella-Fernández, and Blasco-Fontecilla, *Journal of Medical Internet Research*, https://doi.org/10.2196/37742) mixes listening with music therapy and with video-game ideas. Neither review is a trial of this app’s radio stations, and neither makes the player a treatment.
- A meta-analysis of music *therapy* sessions for autistic children found a small gain on social reactions (SMD 0.24) and no clear gain on speech or symptom scores (Ke, Song, Yang, Li, and Liu, *Frontiers in Psychiatry*, 2022, https://pmc.ncbi.nlm.nih.gov/articles/PMC9582596/). Those were therapist-led sessions, not a station left on during homework.

K-LOVE is Positive Encouraging K-LOVE, a Christian contemporary network from Educational Media Foundation, with an official app (`com.emf.klove`) and site streams such as the main feed, Eras, Future Hits, and POP!. Their terms say site content is for personal, non-commercial use and that it may not be copied, transmitted, or distributed without K-LOVE’s express prior written consent (https://release.klove.com/policies/terms-of-use). Playing `listen.klove.com` inside this app is that kind of transmission. This plan does not add the stream, the logo, or the wordmark. The music phase can ask EMF in writing for permission to name the station and to play a specific stream URL. Until that letter exists, the app can tell a parent the official app exists and must not open the stream itself. K-LOVE is lyric-heavy Christian pop and worship. The owner asked for a spiritual pack, not a Christian one, and the studies in this section do not show that this station helps homework. If permission arrives, the stream can sit on an optional shelf a parent turns on, labeled Christian contemporary, separate from Steady Light and separate from the study shelf. It is not the sound of any theme. Air1, their sister network, has the same permission problem and is out until the same kind of letter exists. Themes do not change the music feature.

Recommendation for a later music change, not for this pull request:

1. Split the screen into “While you study” and “For a break,” in that order. Study shelf: instrumental or very low-lyric, steady, and already on the list where the license allows it (Groove Salad, Space Station, WQXR, Sonic Universe if the owner still wants a game-score option). Break shelf: Beat Blender, Indie Pop, Underground 80s, LISTEN.moe, Cliq Hop. The shelves are a starting layout. A child can still pick a lyric station while studying, because the child studies are mixed and preference matters.
2. Let the child mark a small set of favorites. The research that exists keeps pointing at self-chosen and familiar music more than at a house genre.
3. Keep the off control obvious, and keep honoring the sensory sound setting for UI sounds. Add a one-line note that a station can be stopped if it feels like too much. Do not call the player therapy, focus treatment, or ADHD support.
4. Remove DEF CON Radio. The owner said yes. The stream is electronic music; the brand is a security conference.
5. Before adding pop or hip-hop streams, check the station’s terms and whether lyrics are appropriate for ages 13–17. Commercial streams (Spotify, YouTube) bring accounts, recommendations, and ads. The unused playlist types should stay unused. The owner does not want new accounts.
6. Confirm SomaFM, LISTEN.moe, and WQXR allow in-app playback, and keep the privacy-policy sentence that names those hosts accurate if the list changes. Add K-LOVE only after written permission, on a parent-off shelf whose label says it is Christian contemporary music. Do not use their logo without that same permission. Do not attach that shelf to Steady Light.

What to follow when the studies do not agree:

- No station, theme, or quiet line is labeled as proven to help studying, focus, grades, ADHD, or autism. Kämpfe, Sedlmeier, and Renkewitz did not find a reading benefit. Pietschnig, Voracek, and Formann rejected a general learning boost from Mozart. The therapy reviews are not this radio.
- Keep a quieter study shelf because the adult reading meta-analysis and the college lyrics study found small costs, especially with lyrics. Do not lock anyone to it. Madjar, Gazoli, Manor, and Shoval, in a small sample around age 10, found reading gains with music including lyrics in an ADHD-screened group, and Lachance, Pelland-Goulet, and Gosselin (ages 17–30, self-report) point at music the listener chose and already knows.
- Steady Light stays off until a parent opts in. Nothing in this source list shows that spiritual copy raises homework performance, so the app does not say that it does, and a new install does not start there.
- Classical stays available for people who like it. It is not marketed as making a child smarter.

Uncertainty to leave in the UI and in release notes: nothing in this catalog is proven to help neurodivergent students learn. Some listening is linked with slightly worse reading in adult studies, especially with lyrics. Some children in a small ADHD-screened sample read better with music on, including music with lyrics. The honest product is a player they can choose and can stop.

## 7. Licensing, Play, and data

- Do not ship Roblox logos, the Roblox wordmark, Roblox characters, catalog item names, or “oof” / badge sounds as theme assets. The blocky theme is original art of blocky people in original worlds. `TUTOR_CONFIG` still contains Roblox reward names and “roblox-oof” sound ids, and those strings are currently unused. Before any theme reads that file, those strings come out of the user-facing path. This plan does not edit the file, so today’s behavior stays.
- Avatar PNGs stay the current six files for the gamer option. New faces are new files drawn for this app. `PLACEHOLDER.md` is an art spec, not a license for third-party characters.
- Audience stays teens 13–17. The owner considered 11 and kept 13 as the youngest. Play Console target groups stay Ages 13–15 and Ages 16–17 (https://support.google.com/googleplay/android-developer/answer/9867159). Do not select Ages 5 and under, Ages 6–8, or Ages 9–12. The privacy policy already says the app is for teens 13–17 and is not directed to children under 13. That sentence stays. Theme art and store screenshots have to match it. A blocky builder who reads as a young child, or copy aimed under 13, can make Play treat the declared audience as wrong (https://support.google.com/googleplay/android-developer/answer/9893335). The parent still approves any real-money price. The teen’s screen still shows no dollar amount. The listing can speak to the parent without lowering the age of the app.
- Families monetization rules ban emotionally manipulative in-app purchase offers and require a visible difference between virtual currency and real money. Option A has to use that difference in copy. Option B has to go through Play Billing (https://support.google.com/googleplay/android-developer/answer/9858738) and a parent gate.
- Data safety and the privacy policy, when the feature ships, need to mention on-device storage of the theme id, switch history, optional spiritual toggle, and (if option A ships) the same token ledger already described. They need a new sentence only if any of that leaves the device. The recommendation is that it does not. Mood and reflection text already stay in `daily_affirmations` on device; new notes should follow that pattern and, unlike today’s affirmation history, should use the same durable store as other preferences so Android clear-storage and export behave predictably. Moving the existing affirmation key is a behavior change and belongs in the implementation phase, with a migration of the old `localStorage` value.
- This pull request does not edit the privacy policy, the store listing, keystores, or release config.

## 8. Regression safety

Before any implementation phase is called done:

**Economy, on a build that can persist.** Record the ledger JSON. Earn one homework completion (+10, same operation id does not pay twice). Earn one focus session and confirm the amount equals the minutes. Spend a shop item and confirm `balance` drops by `item.cost` and `pendingPurchase` clears. Claim a parent reward, deny it, and confirm the refund operation id restores the same amount. Switch theme, kill the process, relaunch: balance, `totalEarned`, `totalSpent`, and transaction ids match the pre-switch ledger. Migrate a copy of a v3 ledger and confirm the bytes of that key are unchanged by theme migration. Repeat with a v2-shaped legacy record on a throwaway profile and confirm the existing v2→v3 migration still runs and is not rewritten by the theme profile.

**Theme migration.** A profile with an avatar and a ledger and no `theme_profile_v1` opens on today’s colors, with Focus Gamer or whichever face was saved still selected. A profile with no data opens on positivity. Sensory high-contrast, warm, cool, dyslexia font, and reduced motion still apply on both themes.

**Switch limit.** The cases in section 3.4, plus a manual pass: blocked card shows a date, the companion on screen does not change, Parent Zone PIN can apply a change, and a token purchase cannot run twice from a double tap.

**Visual.** Screenshot the dashboard, shop, wallet, wellness hub, music list, and one Brain Gym game on the gamer theme and compare to the same screens on the build before the theme work. Gamer should match. Positivity is allowed to differ. With the spiritual pack off, Steady Light is absent and the hub has no quiet line. With it on, the hub gains that line and the features on the screen stay the same. Game screens stay as they are until the phase that opts them into tokens.

**Music.** This plan does not change stations. When a later phase does, play and stop one station in each shelf and confirm the sensory sound toggle still mutes UI effects only, unless that phase deliberately wires the two together.

**Out of scope for snapshots.** Store listing, privacy HTML, and billing, until the phase that changes them.

## 9. Phased rollout

1. **This pull request.** Plan only.
2. **Profile and gamer snapshot.** Add the profile type, the migration that writes `gamer` for existing data, and `data-companion-theme=gamer` pointing at the current CSS variables. No new colors, no picker, no spend. Existing and new installs still look the same, because positivity is not applied yet. Tests from section 3.4 that cover migration only.
3. **Positivity for empty installs.** New colors and backgrounds only. Same features as gamer. Existing profiles stay gamer. Picker can show both themes. Weekly limit and initial-choice rule turn on here. Spiritual pack stays off.
4. **Steady Light.** Parent PIN switch, default off. Cosmetic palette from section 2.6, plus the quiet line. Enabling it does not spend a switch or move an existing save off gamer. No Christian assets and no K-LOVE.
5. **Token credit.** 50 tokens, cap of 2, pending-intent flow. Still no Play Billing.
6. **Blocky theme.** Only after original art exists. Map the new avatar. No trademark assets.
7. **Music shelves.** Study shelf and break shelf, remove DEF CON Radio, license check, copy pass. K-LOVE only after written permission, on its own parent-off shelf, not as Steady Light’s sound. No clinical claims. No new accounts.
8. **Parent-gated tutor subscription.** Its own release, after the owner sets the monthly price and the included reply cap. Play Billing, the privacy policy, and Data safety update in that release. The age line stays teens 13–17, and the Play target groups stay Ages 13–15 and Ages 16–17. Existing installs keep today’s 30/day and 200/month allowance until that release says otherwise. The listing can address the parent. The child UI shows no dollar price. Optional IAP for extra switches only if the owner rejects tokens as the only extra-switch payment. No accounts and no server-side switch record.

Each phase after this one gets its own branch and its own check of the ledger. None of them rewrite token history.

## 10. Open questions for the owner

1. **Gamer means today’s look.** Decided: yes. Freeze the daylight shell, neon game screens, and Focus Gamer.
2. **Switch cadence.** Decided: yes. One free committed change per local week starting Monday, one free first choice that does not use that week, and a parent PIN override that does not use it either.
3. **App price.** Decided in direction: $4.99 once is too cheap and will lose money. Choose one: (a) a parent-gated monthly tutor subscription, with the dollar amount and reply cap still open, optional cheaper-per-month annual plan, or (b) a one-time unlock priced above $4.99 plus IAP, where the IAP that funds the tutor is a monthly tutor pack and cosmetic IAP stays optional. Recommended default is (a), with extra theme switches still at 50 tokens. What monthly price and what included AI cap do you want?
4. **Audience age.** Decided: keep 13 as the youngest. The range stays teens 13–17, which is what the privacy policy already says. Play target groups stay Ages 13–15 and Ages 16–17. Ages 11–12 are not added. Art and screenshots stay consistent with that age, especially the later blocky theme.
5. **Spiritual pack.** Decided: spiritual, not Christian. Public name Steady Light. Parent switch, default off. Cosmetic theme plus an optional quiet line. No scripture, no named deity, no homework-benefit claim. A Christian pack is not in this version. K-LOVE stays a separate permission problem, not this theme’s soundtrack.
6. **Blocky art.** Who draws the original blocky companion, and is “blocky builder” an acceptable public name so the UI never says Roblox?
7. **Clear-storage bypass.** Decided: do not create accounts. Clearing app storage may reset the switch limit. No server record.
8. **Music.** Decided: yes to the study shelf and the break shelf, and yes to removing DEF CON Radio. Where the studies disagree, keep the choice and do not claim a station is proven to help. K-LOVE is requested. It stays out of the player until Educational Media Foundation gives written permission, and it is not Steady Light’s soundtrack. Pop or hip-hop still waits on a station whose terms allow an in-app stream.
9. **Wellness Hub.** Decided: no. A positivity theme does not change features. It changes colors, backgrounds, and other UI chrome. The hub’s lines stay the same feature on every theme.
10. **Reset App copy.** Decided: yes. Update the confirmation when the switch profile ships so it matches what Reset clears and what it keeps.

## 11. Sources

- Kämpfe, J., Sedlmeier, P., & Renkewitz, F. (2011). The impact of background music on adult listeners: A meta-analysis. *Psychology of Music*. https://doi.org/10.1177/0305735610376261
- Souza, A. S., & Barbosa, L. C. L. (2023). Should we turn off the music? Music with lyrics interferes with cognitive tasks. *Journal of Cognition*. https://doi.org/10.5334/joc.273
- Pietschnig, J., Voracek, M., & Formann, A. K. (2010). Mozart effect–Shmozart effect: A meta-analysis. *Intelligence*. https://doi.org/10.1016/j.intell.2010.03.006
- Lachance, K.-A., Pelland-Goulet, P., & Gosselin, N. (2025). Listening habits and subjective effects of background music in young adults with and without ADHD. *Frontiers in Psychology*. https://doi.org/10.3389/fpsyg.2024.1508181
- Bhatara, A., Quintin, E.-M., Fombonne, E., & Levitin, D. J. (2013). Early sensitivity to sound and musical preferences and enjoyment in adolescents with autism spectrum disorders. *Psychomusicology: Music, Mind, and Brain*. https://doi.org/10.1037/a0033754
- Applewhite, B., Cankaya, Z., Heiderscheit, A., & Himmerich, H. (2022). A systematic review of scientific studies on the effects of music in people with or at risk for autism spectrum disorder. *International Journal of Environmental Research and Public Health*. https://doi.org/10.3390/ijerph19095150
- IFPI. (2023). *Engaging with Music 2023*. https://www.ifpi.org/wp-content/uploads/2023/12/IFPI-Engaging-With-Music-2023_full-report.pdf
- Madjar, N., Gazoli, R., Manor, I., & Shoval, G. (2020). Contrasting effects of music on reading comprehension in preadolescents with and without ADHD. *Psychiatry Research*. https://doi.org/10.1016/j.psychres.2020.113207
- Mendes, C. G., de Paula, J. J., & Miranda, D. M. (2024). Effects of background music on attentional networks of children with and without attention deficit/hyperactivity disorder. *Interactive Journal of Medical Research*. https://doi.org/10.2196/53869
- Saville, P., Kinney, C., Heiderscheit, A., & Himmerich, H. (2025). Exploring the intersection of ADHD and music: A systematic review. *Behavioral Sciences*. https://doi.org/10.3390/bs15010065
- Martin-Moratinos, M., Bella-Fernández, M., & Blasco-Fontecilla, H. (2023). Effects of music on attention-deficit/hyperactivity disorder (ADHD) and potential application in serious video games: Systematic review. *Journal of Medical Internet Research*. https://doi.org/10.2196/37742
- Ke, X., Song, W., Yang, M., Li, J., & Liu, W. (2022). Effectiveness of music therapy in children with autism spectrum disorder: A systematic review and meta-analysis. *Frontiers in Psychiatry*. https://pmc.ncbi.nlm.nih.gov/articles/PMC9582596/
- K-LOVE terms of use. https://release.klove.com/policies/terms-of-use
- Google Play target audience settings. https://support.google.com/googleplay/android-developer/answer/9867159
- Google Play Families policies. https://support.google.com/googleplay/android-developer/answer/9893335
- Google Play payments policy. https://support.google.com/googleplay/android-developer/answer/9858738
- Google Play purchase approvals. https://support.google.com/googleplay/answer/7039872
