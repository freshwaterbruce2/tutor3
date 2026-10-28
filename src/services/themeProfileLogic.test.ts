import assert from 'node:assert/strict';
import {
  commitCompanion,
  freshProfile,
  grantSwitchCredit,
  localMonday,
  parseThemeProfile,
  profileForInstall,
  setSpiritualPack,
  stageSwitchCredit,
  statusSentence,
  THEME_SWITCH_CREDIT_COST,
} from './themeProfileLogic';

const monday = new Date(2026, 9, 26, 9, 0, 0);
const tuesday = new Date(2026, 9, 27, 9, 0, 0);
const nextMonday = new Date(2026, 10, 2, 9, 0, 0);

function change(profile: ReturnType<typeof freshProfile>, themeId: typeof profile.activeThemeId, at: Date) {
  return {
    themeId,
    fromAvatarId: 'avatar-ai-buddy',
    toAvatarId: themeId === 'gamer' ? 'avatar-boy-headphones' : 'avatar-ai-buddy',
    at: at.getTime(),
  };
}

const migrated = profileForInstall(true, monday);
assert.equal(migrated.activeThemeId, 'gamer');
assert.equal(migrated.freeSelectionAvailable, true);
assert.equal(migrated.spiritualPackEnabled, false);
assert.equal('balance' in migrated, false);

const born = profileForInstall(false, monday);
assert.equal(born.activeThemeId, 'positivity');
assert.notEqual(born.activeThemeId, 'gamer');

const initial = commitCompanion(born, change(born, 'positivity', monday), 'auto');
assert.equal(initial.ok, true);
if (initial.ok) {
  assert.equal(initial.via, 'initial');
  assert.equal(initial.profile.freeSelectionAvailable, false);
  assert.equal(initial.profile.freeSwitchUsed, false);
}

const again = initial.ok
  ? commitCompanion(initial.profile, change(initial.profile, 'gamer', tuesday), 'auto')
  : initial;
assert.equal(again.ok, true);
if (again.ok) {
  assert.equal(again.via, 'weekly');
  assert.equal(again.profile.freeSwitchUsed, true);
  assert.equal(again.profile.weekStart, localMonday(tuesday));
}

const blocked = again.ok
  ? commitCompanion(again.profile, change(again.profile, 'positivity', tuesday), 'auto')
  : again;
assert.equal(blocked.ok, false);
if (!blocked.ok) assert.equal(blocked.reason, 'blocked');
if (again.ok) {
  assert.equal(again.profile.purchasedCredits, 0);
  assert.match(statusSentence(again.profile, tuesday), /Monday/);
}

const nextWeek = again.ok
  ? commitCompanion(again.profile, change(again.profile, 'positivity', nextMonday), 'auto')
  : again;
assert.equal(nextWeek.ok, true);
if (nextWeek.ok) assert.equal(nextWeek.via, 'weekly');

const unchanged = again.ok
  ? commitCompanion(
      again.profile,
      {
        themeId: again.profile.activeThemeId,
        fromAvatarId: 'avatar-boy-headphones',
        toAvatarId: 'avatar-boy-headphones',
        at: tuesday.getTime(),
      },
      'auto',
    )
  : again;
assert.equal(unchanged.ok, false);
if (!unchanged.ok) assert.equal(unchanged.reason, 'unchanged');

const parent = again.ok
  ? commitCompanion(again.profile, change(again.profile, 'positivity', tuesday), 'parent')
  : again;
assert.equal(parent.ok, true);
if (parent.ok && again.ok) {
  assert.equal(parent.via, 'parent');
  assert.equal(parent.profile.freeSwitchUsed, again.profile.freeSwitchUsed);
  assert.equal(parent.profile.purchasedCredits, again.profile.purchasedCredits);
}

const packed = setSpiritualPack(born, true);
assert.equal(packed.activeThemeId, born.activeThemeId);
assert.equal(packed.freeSwitchUsed, born.freeSwitchUsed);
const hidden = commitCompanion(born, { ...change(born, 'spiritual', monday), toAvatarId: 'avatar-ai-buddy' }, 'auto');
assert.equal(hidden.ok, false);
if (!hidden.ok) assert.equal(hidden.reason, 'spiritual-disabled');

const staged = stageSwitchCredit(born, 'theme-switch-credit:one', monday.getTime());
assert.equal(staged.ok, true);
if (staged.ok) {
  assert.equal(staged.profile.purchasedCredits, 0);
  assert.equal(staged.profile.pendingCredit?.cost, THEME_SWITCH_CREDIT_COST);
  const failed = staged.profile;
  assert.equal(failed.purchasedCredits, 0);
  assert.ok(failed.pendingCredit);
  const granted = grantSwitchCredit(staged.profile, 'theme-switch-credit:one');
  assert.equal(granted.purchasedCredits, 1);
  assert.equal(granted.pendingCredit, null);
  const retried = grantSwitchCredit(granted, 'theme-switch-credit:one');
  assert.equal(retried.purchasedCredits, 1);
  const autoCredit = commitCompanion(
    { ...granted, freeSelectionAvailable: false, freeSwitchUsed: true, purchasedCredits: 1 },
    change(granted, 'gamer', tuesday),
    'auto',
  );
assert.equal(autoCredit.ok, true);
if (autoCredit.ok) {
  assert.equal(autoCredit.via, 'credit');
  assert.equal(autoCredit.profile.purchasedCredits, 0);
  assert.equal(autoCredit.profile.freeSwitchUsed, true);
}

const preferWeekly = commitCompanion(
  { ...granted, freeSelectionAvailable: false, freeSwitchUsed: false, purchasedCredits: 1, weekStart: localMonday(tuesday) },
  {
    themeId: 'gamer',
    fromAvatarId: 'avatar-ai-buddy',
    toAvatarId: 'avatar-girl-glasses',
    at: tuesday.getTime(),
  },
  'auto',
);
assert.equal(preferWeekly.ok, true);
if (preferWeekly.ok) {
  assert.equal(preferWeekly.via, 'weekly');
  assert.equal(preferWeekly.profile.purchasedCredits, 1);
}

const used = commitCompanion(
    { ...granted, freeSelectionAvailable: false, freeSwitchUsed: true },
    change(granted, 'gamer', tuesday),
    'credit',
  );
  assert.equal(used.ok, true);
  if (used.ok) {
    assert.equal(used.via, 'credit');
    assert.equal(used.profile.purchasedCredits, 0);
    assert.equal(used.profile.freeSwitchUsed, true);
  }
}

const capped = stageSwitchCredit(
  { ...born, purchasedCredits: 2, pendingCredit: null },
  'theme-switch-credit:cap',
  monday.getTime(),
);
assert.equal(capped.ok, false);
if (!capped.ok) assert.equal(capped.reason, 'cap');

const roundTrip = parseThemeProfile(JSON.parse(JSON.stringify(migrated)));
assert.deepEqual(roundTrip, migrated);
assert.equal(parseThemeProfile({ ...migrated, balance: 10 }), null);

console.log('theme profile logic: ok');
