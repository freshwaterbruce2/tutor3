import { useLayoutEffect, useRef, useState } from 'react';
import { AvatarImage } from '@vibetech/avatars';
import { Sparkles, User, Users } from 'lucide-react';
import { ONBOARDING_AVATARS, ONBOARDING_BRAND } from './onboardingVisuals';

export interface OnboardingResult {
  userType: 'kid' | 'parent';
  avatar: string;
  name: string;
}

interface FirstRunOnboardingProps {
  onComplete: (data: OnboardingResult) => void | Promise<void>;
}

const WELCOME_TOKENS = 25;

const FirstRunOnboarding = ({ onComplete }: FirstRunOnboardingProps) => {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [userType, setUserType] = useState<'kid' | 'parent' | null>('kid');
  const [avatar, setAvatar] = useState<string | null>(ONBOARDING_AVATARS[0]?.id ?? 'avatar-ai-buddy');
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedAvatar = ONBOARDING_AVATARS.find((option) => option.id === avatar);

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [step]);

  const handleFinish = async () => {
    if (!userType || !avatar || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await onComplete({ userType, avatar, name: name.trim() });
    } catch {
      setSubmitError('We could not finish setup. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div
      ref={scrollRef}
      className="h-full min-h-0 box-border flex flex-col items-center overflow-y-auto px-6 py-8 bg-[var(--background-main)]"
    >
      <div className="my-auto w-full max-w-lg shrink-0 bg-white rounded-2xl p-8 border border-[var(--glass-border)] shadow-sm space-y-6">
        <div className="space-y-2">
          <p className="text-center text-xs font-bold text-teal-700" aria-live="polite">
            Studio Profile Setup · Step {step + 1} of 3
          </p>
          <div className="flex justify-center gap-2" aria-label="Onboarding progress">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                aria-hidden="true"
                className={`h-2 w-10 rounded-full transition-colors ${
                  i <= step ? 'bg-teal-700' : 'bg-[var(--background-surface)]'
                }`}
              />
            ))}
          </div>
        </div>

        {step === 0 && (
          <div className="space-y-6 text-center">
            <div className="flex justify-center">
              <div className="inline-flex items-center justify-center rounded-2xl border border-teal-200 bg-teal-50 p-4 text-teal-700">
                <Sparkles className="w-10 h-10" />
              </div>
            </div>
            <div className="space-y-1.5">
              <h1 className="text-2xl md:text-3xl font-extrabold text-[var(--text-primary)] font-display">
                Welcome to {ONBOARDING_BRAND.title} Studio
              </h1>
              <p className="text-sm text-[var(--text-secondary)]">{ONBOARDING_BRAND.subtitle}</p>
            </div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Who is personalizing this workspace?
            </p>
            <div className="grid grid-cols-2 gap-3.5">
              <button
                type="button"
                onClick={() => {
                  setUserType('kid');
                  setStep(1);
                }}
                className="p-5 rounded-xl bg-[var(--background-main)] hover:bg-teal-50 transition-colors border-2 border-[var(--glass-border)] hover:border-teal-600 flex flex-col items-center gap-2"
              >
                <User className="w-6 h-6 text-teal-700" />
                <span className="font-bold text-sm text-[var(--text-primary)]">I&apos;m the Student</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setUserType('parent');
                  setStep(1);
                }}
                className="p-5 rounded-xl bg-[var(--background-main)] hover:bg-orange-50 transition-colors border-2 border-[var(--glass-border)] hover:border-orange-500 flex flex-col items-center gap-2"
              >
                <Users className="w-6 h-6 text-orange-600" />
                <span className="font-bold text-sm text-[var(--text-primary)]">I&apos;m the Parent</span>
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6 text-center">
            <div className="space-y-1">
              <h1 className="text-2xl font-extrabold text-[var(--text-primary)] font-display">
                Choose Your Study Companion Avatar
              </h1>
              <p className="text-sm text-[var(--text-secondary)]">
                {userType === 'kid' ? 'Pick the character that represents you!' : 'Pick a starter avatar for your teen.'}
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {ONBOARDING_AVATARS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setAvatar(option.id)}
                  className={`rounded-xl p-3 transition-all border-2 bg-[var(--background-main)] ${
                    avatar === option.id
                      ? 'border-teal-700 bg-teal-50/50 shadow-xs'
                      : 'border-[var(--glass-border)] hover:border-stone-300'
                  }`}
                  aria-label={`Choose avatar ${option.name}`}
                >
                  <div className="flex flex-col items-center justify-center gap-2 text-center">
                    <div className="w-full aspect-square rounded-xl bg-white border border-[var(--glass-border)] flex items-center justify-center overflow-hidden p-1">
                      <AvatarImage
                        src={option.imagePath}
                        alt={option.name}
                        size={88}
                        className="h-full w-full"
                        style={{ borderRadius: '8px' }}
                      />
                    </div>
                    <div className="leading-tight">
                      <p className="text-xs font-bold text-[var(--text-primary)]">{option.name}</p>
                      <p className="text-[11px] text-[var(--text-secondary)]">{option.subtitle}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(0)}
                className="flex-1 px-4 py-3 rounded-xl font-semibold text-sm text-[var(--text-secondary)] bg-[var(--background-surface)] hover:text-[var(--text-primary)]"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!avatar}
                className="glass-button flex-1 px-4 py-3 rounded-xl font-semibold text-sm text-white disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 text-center">
            <div className="flex justify-center">
              {selectedAvatar ? (
                <AvatarImage
                  src={selectedAvatar.imagePath}
                  alt={selectedAvatar.name}
                  size={104}
                  className="rounded-2xl border-2 border-teal-600 shadow-sm"
                  style={{ borderRadius: '16px' }}
                />
              ) : null}
            </div>
            <h1 className="text-2xl font-extrabold text-[var(--text-primary)] font-display">
              Almost Ready!
            </h1>
            <div className="text-left">
              <label
                htmlFor="onboarding-name"
                className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5"
              >
                What should we call you? (optional)
              </label>
              <input
                id="onboarding-name"
                name="onboarding-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={24}
                placeholder="Your first name or nickname"
                className="w-full rounded-xl bg-[var(--background-main)] border border-[var(--glass-border)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-teal-600"
              />
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              You&apos;ll receive{' '}
              <span className="font-bold text-amber-700 font-mono">+{WELCOME_TOKENS} tokens</span>{' '}
              as a welcome bonus to spend in the Avatar Shop.
            </p>
            {submitError && (
              <p role="alert" className="text-sm text-red-700">
                {submitError}
              </p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={isSubmitting}
                className="flex-1 px-4 py-3 rounded-xl font-semibold text-sm text-[var(--text-secondary)] bg-[var(--background-surface)]"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => void handleFinish()}
                disabled={isSubmitting}
                className="glass-button flex-1 px-4 py-3 rounded-xl font-semibold text-sm text-white disabled:opacity-50"
              >
                {isSubmitting ? 'Saving…' : 'Save & Claim 25 Tokens'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FirstRunOnboarding;
export { WELCOME_TOKENS };
