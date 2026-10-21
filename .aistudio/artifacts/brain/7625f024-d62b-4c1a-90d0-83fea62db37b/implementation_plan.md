# VibeTutor 2.0 Implementation Plan

## 1. Intended Result
Upgrade Vibe Tutor Studio into **VibeTutor 2.0** (*"Homework help, one step at a time"*), a calm, respectful learning companion for teens ages 13–17 centered on the complete flow:
**Add an assignment → choose a small step → get tutor help → focus → save progress → return later.**

Key deliverables:
- **Actionable Today Desk**: Compact greeting with local-storage transparency, a top **"Your next step"** card (assignment title/subject, editable next action, editable time estimate, **"Start this step"** primary CTA, **"Help me get started"** secondary CTA), and the assignment list directly below with due dates, supportive overdue copy (*"Let's make a plan"*), step checklists, inline editing, complete/reopen, and delete with undo.
- **Simplified 4-Destination Navigation**: Primary navigation focused on **Today**, **Tutor**, **Practice** (Subject Realms & Brain Gym), and **Progress** (completed work, steps, focus time, topics, goals, achievements), using one primary navigation system per screen size (compact sidebar on desktop, bottom bar on mobile) plus secondary access to Focus Timer, Daily Routine, Study Buddy, Study Radio, Mindful Corner, Rewards, Comfort Settings, and Parent Zone.
- **Persistent Assignment & Step Context**: Active assignment and selected step follow the student across **Today**, **Tutor**, and **Focus** without starting over.
- **Signature Socratic Tutor**: Opens with the active assignment and step in context, offers 5 guided actions (*Break it down*, *Give me a hint*, *Explain it another way*, *Show a similar example*, *Check my work*), includes an interactive **"Break it down"** checklist builder that saves editable steps back to the assignment, and runs an honest, clearly labeled scripted Socratic tutoring engine without automatically connecting to the Gemini Developer API.
- **Focus Connected to Real Work**: Persistent focus timer attached to the active assignment/step with preset & custom durations, pause/resume/finish, optional break, and a gentle *"What did you get done?"* completion prompt that saves actual step progress and notes without auto-completing the whole assignment.
- **Consistent Visual System**: Warm off-white (`#F7F6F2`), white main surfaces (`#FFFFFF`), deep teal primary actions (`#0F766E`), soft mint (`#EAF6F0`), light lavender (`#EFEAFA`), and dark slate text (`#1F2937`).

## 2. Affected Files
- `src/types.ts` — Add `HomeworkStep` and `ActiveWorkContext` interfaces; extend `HomeworkItem` with optional `steps`, `estimatedMinutes`, and `progressNotes`.
- `src/services/dataStore.ts` — Validate and preserve `steps`, `estimatedMinutes`, and `progressNotes` in `parseWebHomeworkItems`.
- `src/hooks/useHomework.ts` — Expose `restoreHomework` (for undo delete) and step-level helpers while preserving existing storage.
- `src/styles/theme.css` & `src/index.css` — Apply the VibeTutor 2.0 palette (`#F7F6F2`, `#FFFFFF`, `#0F766E`, `#EAF6F0`, `#EFEAFA`, `#1F2937`), accessible focus rings, and reduced-motion support.
- `src/components/ui/Sidebar.tsx` — Implement the 4 primary destinations (**Today**, **Tutor**, **Practice**, **Progress**), active assignment context pill, and secondary tools menu (desktop compact sidebar, mobile bottom nav).
- `src/App.tsx` & `src/components/AppViewRenderer.tsx` — Remove duplicate top navigation bar in favor of a single primary nav per breakpoint + persistent current-assignment context bar across Today, Tutor, and Focus; wire Practice and Progress views.
- `src/components/dashboard/HomeworkDashboard.tsx`, `src/components/dashboard/HomeworkItem.tsx`, `src/components/dashboard/AddHomeworkModal.tsx` — Implement the compact greeting, **"Your next step"** top card, step checklist management, edit/delete-with-undo, and supportive overdue copy.
- `src/components/features/ChatWindow.tsx`, `src/components/features/chat/ChatHeader.tsx`, `src/services/tutorService.ts`, `src/services/secureClient.ts`, `server.ts` — Implement the contextual Socratic Tutor with the 5 guided actions, interactive editable **"Break it down"** checklist saver, and honest scripted Socratic tutoring mode (no automatic Gemini Developer API connection).
- `src/components/features/FocusTimer.tsx` — Connect focus sessions to the active assignment/step, persist timer state across navigation/refresh, and add the *"What did you get done?"* completion prompt and optional break.
- `src/components/ui/AchievementCenter.tsx` — Upgrade into the **Progress** hub displaying real Steps Completed, Assignments Finished, Time Spent Focusing, Topics Practiced, Completed Work log, Daily Goals, optional Streak, and Achievements/Rewards.

## 3. Non-Goals
- No cloud database migration or new external subscriptions.
- No automatic connection of teen chats to unverified external LLM APIs.
- No removal of existing secondary features (Brain Gym, Subject Realms, Music Radio, Schedules, Wellness, Avatar Shop, Sensory Settings, Parent Zone).

## 4. Acceptance Checks
1. "Your next step" card is immediately visible near the top of Today without scrolling on mobile (`320px`/`390px`) and desktop (`768px`/`1440px`).
2. Adding, editing, completing, reopening, and deleting (with Undo) an assignment persists across page refresh.
3. Clicking "Help me get started" opens Tutor with that assignment and selected step in context.
4. Clicking "Break it down" generates an editable checklist that can be reviewed, modified, and saved to the assignment.
5. Clicking "Start this step" opens Focus with that assignment and step attached; timer state survives navigation and refresh; finishing prompts "What did you get done?" and saves real step progress without auto-completing the whole assignment.
6. Completing a step or focus session accurately updates Progress metrics.
7. Keyboard navigation, dialogs, and responsive layouts (`320px`, `390px`, `768px`, `1440px`) work without overlap or horizontal scrolling.
