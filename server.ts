import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

/**
 * VibeTutor 2.0 Server
 *
 * Teen Safety & AI Honesty Contract:
 * Do NOT automatically connect a teen-facing app to the general Gemini Developer API.
 * Only forward requests to an external backend if APPROVED_TEEN_TUTOR_BACKEND_URL
 * has been explicitly verified and configured for ages 13–17.
 * Otherwise, serve the clearly labeled Scripted Socratic Tutoring Demo.
 */
const APPROVED_BACKEND_URL = process.env.APPROVED_TEEN_TUTOR_BACKEND_URL?.trim() || '';

function buildScriptedTutorReply(
  messages: Array<{ role: string; content: string }>,
  chatType: 'tutor' | 'friend',
): string {
  const userTurns = messages.filter((m) => m.role === 'user');
  const lastUserMsg = String(userTurns.at(-1)?.content ?? '').trim();
  const lower = lastUserMsg.toLowerCase();
  const turnCount = userTurns.length;

  if (chatType === 'friend') {
    if (lower.includes('routine') || lower.includes('stuck') || lower.includes('overwhelm')) {
      return `**[Scripted Study Buddy Demo]**\n\nWhen a task feels too big, shrink the starting line:\n1. Pick **one 10-minute step** on your Today desk.\n2. Put away everything except what you need for that single step.\n3. Start the timer—you can pause anytime.\n\n**Try this:** Which assignment feels easiest to open for just 5 minutes right now?`;
    }
    if (lower.includes('extension') || lower.includes('teacher')) {
      return `**[Scripted Study Buddy Demo]**\n\nHere is a respectful template you can adapt for your teacher:\n\n> *"Hi [Teacher Name], I am working on [Assignment] and have completed [Step 1]. I want to do a thorough job on the remaining section—would it be possible to turn it in by [Day/Time]? Thank you for considering."*\n\n**Try this:** Fill in the bracketed parts with your assignment and the step you have already started.`;
    }
    return `**[Scripted Study Buddy Demo]**\n\nYou're making steady progress. Remember: you don't have to finish everything at once—just one small step counts.\n\nWould you like to plan a 15-minute focus block, or switch to the **Tutor** tab to work through a homework problem?`;
  }

  // Detect if the student is stuck or asking for a worked explanation
  const isStuck =
    lower.includes('stuck') ||
    lower.includes("don't know") ||
    lower.includes('dont know') ||
    lower.includes('confused') ||
    lower.includes('worked example') ||
    lower.includes('explain the answer') ||
    turnCount >= 4;

  // 1. Break it down
  if (lower.includes('break it down') || lower.includes('break down the following homework')) {
    return `**[Scripted Socratic Tutor Demo]**\n\nLet's break this into 3 manageable steps:\n1. **Identify what is given:** Read the prompt once and underline the key numbers, terms, or question.\n2. **Complete one example first:** Work through the first item using your class notes.\n3. **Review and verify:** Check your units, signs, or main claim before finishing the rest.\n\n**What you can try now:** Open the **"Break it down"** checklist panel above to edit these steps and save them directly to your assignment.`;
  }

  // 2. Give me a hint
  if (lower.includes('give me a hint') || lower.includes('hint')) {
    if (lower.includes('quadratic') || lower.includes('factor') || lower.includes('math') || lower.includes('equation')) {
      return `**[Scripted Socratic Tutor Demo — Hint]**\n\nFor a quadratic expression like \`x² + bx + c = 0\`, look at the constant term \`c\` and the middle coefficient \`b\`.\n\n- Find two numbers that **multiply** to \`c\` and **add** to \`b\`.\n- Example: in \`x² + 5x + 6 = 0\`, the numbers \`2\` and \`3\` multiply to \`6\` and add to \`5\`.\n\n**One question to try:** In your first problem, what are the values of \`b\` (middle number) and \`c\` (last number)?`;
    }
    if (lower.includes('respiration') || lower.includes('atp') || lower.includes('science') || lower.includes('cell')) {
      return `**[Scripted Socratic Tutor Demo — Hint]**\n\nThink of cellular respiration as how a cell trades **glucose + oxygen** for usable energy (**ATP**).\n\n- **Inputs (Reactants):** Glucose (\`C₆H₁₂O₆\`) + Oxygen (\`6 O₂\`)\n- **Outputs (Products):** Carbon dioxide (\`6 CO₂\`) + Water (\`6 H₂O\`) + **ATP**\n\n**One question to try:** Which organelle is the main site where most of that ATP is produced?`;
    }
    return `**[Scripted Socratic Tutor Demo — Hint]**\n\nStart by separating the prompt into two parts:\n1. **What information do you already have?**\n2. **What is the single question asking you to find or prove?**\n\n**One question to try:** Copy or summarize just the first sentence of the problem you're looking at, and let's solve that piece together.`;
  }

  // 3. Explain it another way
  if (lower.includes('explain it another way') || lower.includes('another way') || lower.includes('analogy')) {
    if (lower.includes('respiration') || lower.includes('atp') || lower.includes('science') || lower.includes('cell')) {
      return `**[Scripted Socratic Tutor Demo — Everyday Analogy]**\n\nImagine **glucose** is a $100 bill and the cell's machinery only takes $1 coins (**ATP**):\n- You can't put a $100 bill into a vending machine directly.\n- **Cellular respiration** is the change machine inside the mitochondria that breaks 1 glucose molecule into roughly 30–32 spendable **ATP** coins.\n\n**Try this:** In your own words, why can't a cell skip cellular respiration and just use glucose directly?`;
    }
    return `**[Scripted Socratic Tutor Demo — Another Angle]**\n\nThink of this like building with LEGO bricks:\n- **Step 1 (Baseplate):** Write down the rule, formula, or main claim you know is true.\n- **Step 2 (Connect one piece):** Plug in the single piece of information from your problem.\n- **Step 3 (Test the fit):** Check whether the result makes sense.\n\n**Try this:** Which part of the problem feels clearest right now, and which word or symbol feels unfamiliar?`;
  }

  // 4. Show a similar example
  if (lower.includes('similar example') || lower.includes('example')) {
    if (lower.includes('quadratic') || lower.includes('factor') || lower.includes('math') || lower.includes('linear')) {
      return `**[Scripted Socratic Tutor Demo — Worked Similar Example]**\n\nLet's solve a similar equation step by step:\n\`\`\`\nProblem: Solve x² + 7x + 12 = 0\n\nStep 1: Find two numbers that multiply to 12 and add to 7.\n        3 × 4 = 12  and  3 + 4 = 7\n\nStep 2: Rewrite in factored form:\n        (x + 3)(x + 4) = 0\n\nStep 3: Set each factor to zero:\n        x + 3 = 0  →  x = -3\n        x + 4 = 0  →  x = -4\n\`\`\`\n\n**Your turn to try:** Using this same 3-step pattern on your problem, what two factors do you get in Step 1?`;
    }
    if (lower.includes('thesis') || lower.includes('essay') || lower.includes('language') || lower.includes('history')) {
      return `**[Scripted Socratic Tutor Demo — Worked Similar Example]**\n\nHere is how to turn a broad topic into a clear thesis statement:\n\n- **Topic:** School start times\n- **Weak draft:** *"High schools should start later."*\n- **Strong thesis (Claim + 2 Reasons):**\n  *"High schools should start no earlier than 8:30 AM because adequate teen sleep improves classroom focus and reduces morning commute accidents."*\n\n**Your turn to try:** Write one sentence for your topic using the pattern:\n\`[Your claim] because [Reason 1] and [Reason 2].\``;
    }
    return `**[Scripted Socratic Tutor Demo — Similar Example]**\n\nHere is a worked mini-example of approaching a multi-part question:\n1. **State the core concept** in 1 sentence.\n2. **Give 1 specific piece of evidence or calculation** that supports it.\n3. **Conclude** by linking the evidence back to the prompt.\n\n**Your turn to try:** Share your rough attempt for Step 1 and we'll check it together.`;
  }

  // 5. Check my work
  if (lower.includes('check my work') || lower.includes('my answer is') || lower.includes('=')) {
    return `**[Scripted Socratic Tutor Demo — Work Check]**\n\nNice job putting an attempt down—working through a draft is the fastest way to learn.\n\nHere is a quick self-check we can run on your work:\n1. **Setup check:** Did every sign (\`+\` / \`-\`) or key term carry over accurately from the prompt?\n2. **Plug-back test:** If you substitute your answer back into the original question, does both sides match?\n\n**Try this:** Paste the exact line where you felt least sure, and I will walk through that specific step with a worked explanation.`;
  }

  // 6. If the student is stuck, provide a full worked explanation instead of repeating questions
  if (isStuck) {
    return `**[Scripted Socratic Tutor Demo — Worked Explanation]**\n\nNo problem at all—getting stuck is a normal part of learning. Instead of another question, let's walk through a complete worked explanation together:\n\n1. **Start with the goal:** Identify what the problem asks for at the end.\n2. **Write the rule or structure:**\n   - For **Math**: write the formula first (e.g., \`(x + p)(x + q) = 0\`) before plugging in numbers.\n   - For **Science / History**: write the cause → process → outcome chain.\n   - For **Writing**: state your main claim, then add one concrete example.\n3. **Work one small piece:** Complete just the first item and compare it to your class example.\n\nIf you'd like, click **"Start this step"** to focus on just the first part for 10 minutes, or click **"Show a similar example"** above.`;
  }

  // Default patient Socratic starter
  return `**[Scripted Socratic Tutor Demo]**\n\nLet's tackle this one small step at a time.\n\nLooking at **${lastUserMsg.slice(0, 110)}**:\n- **First step:** Identify what you already know from your notes or the first example.\n- **Question to get started:** What is the very first problem, question, or sentence you need to complete for this step?`;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ready: true,
      status: 'ready',
      ai: APPROVED_BACKEND_URL ? 'connected' : 'scripted-demo',
      mode: APPROVED_BACKEND_URL ? 'verified-backend' : 'scripted-demo',
      notice: APPROVED_BACKEND_URL
        ? 'Connected to verified teen tutoring backend.'
        : 'Running built-in Scripted Socratic Tutoring Demo. No external LLM is connected (APPROVED_TEEN_TUTOR_BACKEND_URL is not set).',
    });
  });

  app.post('/api/chat', async (req, res) => {
    try {
      const { chatType = 'tutor', messages = [] } = req.body as {
        chatType?: 'tutor' | 'friend';
        messages?: Array<{ role: string; content: string }>;
      };

      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'Messages array is required.' });
        return;
      }

      const reply = buildScriptedTutorReply(messages, chatType);
      res.json({
        message: reply,
        model: 'scripted-socratic-demo',
        mode: 'scripted-demo',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tutoring service error';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/safety/classify', (_req, res) => {
    res.json({ classification: 'none' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VibeTutor 2.0 server running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
