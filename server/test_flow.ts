import { loadPlans } from "./src/core/planRegistry.js";
import { createSession } from "./src/core/sessionContext.js";
import { startTask, handleVoiceTurn } from "./src/core/orchestrator.js";
import { initDatabase, getRecipients, getFirstParticipant } from "./src/data/database.js";
import type { Recipient } from "./src/core/types.js";

async function test() {
  await initDatabase();
  loadPlans();

  const participant = getFirstParticipant()!;
  const recipients: Recipient[] = getRecipients();
  const session = createSession(participant.id);

  console.log(`\nParticipant: ${participant.name}, Balance: ${participant.balance}`);
  console.log(`Recipients: ${recipients.map(r => r.name).join(", ")}\n`);

  // Step 1: Start Send Money
  const r1 = startTask(session, "send_money");
  console.log(`1. START TASK → Prompt: ${r1.prompt_text} | Screen: ${r1.ui_update.screen}`);

  // Step 2: Say recipient name
  const r2 = handleVoiceTurn(session, "করিম", recipients, participant.pin, participant.balance);
  console.log(`2. SAY করিম → Prompt: ${r2.prompt_text} | Screen: ${r2.ui_update.screen}`);
  console.log(`   Slots: ${JSON.stringify(r2.ui_update.filled_slots)}`);

  // Step 3: Say amount
  const r3 = handleVoiceTurn(session, "পাঁচশো", recipients, participant.pin, participant.balance);
  console.log(`3. SAY পাঁচশো → Prompt: ${r3.prompt_text} | Screen: ${r3.ui_update.screen}`);
  console.log(`   Slots: ${JSON.stringify(r3.ui_update.filled_slots)}`);

  // Step 4: Confirm
  const r4 = handleVoiceTurn(session, "হ্যাঁ", recipients, participant.pin, participant.balance);
  console.log(`4. SAY হ্যাঁ → Prompt: ${r4.prompt_text} | Screen: ${r4.ui_update.screen}`);

  // Step 5: PIN
  const r5 = handleVoiceTurn(session, "1234", recipients, participant.pin, participant.balance);
  console.log(`5. PIN 1234 → Prompt: ${r5.prompt_text} | Screen: ${r5.ui_update.screen}`);
  console.log(`   Task Complete: ${r5.ui_update.task_complete}`);

  console.log("\n=== FLOW COMPLETE ===");
}

test().catch(console.error);
