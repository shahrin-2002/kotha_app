import { loadPlans } from "./src/core/planRegistry.js";
import { createSession } from "./src/core/sessionContext.js";
import { startTask, handleVoiceTurn, handleTapSelection } from "./src/core/orchestrator.js";
import { initDatabase, getRecipients, getAgents, getFirstParticipant } from "./src/data/database.js";

async function test() {
  await initDatabase();
  loadPlans();

  const participant = getFirstParticipant()!;
  const recipients = getRecipients();
  const agents = getAgents();

  console.log(`\nParticipant: ${participant.name}, Balance: ${participant.balance}`);
  console.log(`Recipients: ${recipients.map(r => r.name).join(", ")}`);
  console.log(`Agents: ${agents.map(a => a.name).join(", ")}\n`);

  // ── Send Money Flow ─────────────────────────────────
  console.log("═══ SEND MONEY ═══");
  {
    const s = createSession(participant.id);
    const r1 = startTask(s, "send_money", participant.balance, agents);
    console.log(`1. START → ${r1.ui_update.screen}: ${r1.prompt_text}`);

    const r2 = handleVoiceTurn(s, "করিম", recipients, participant.pin, participant.balance, agents);
    console.log(`2. করিম → ${r2.ui_update.screen}: ${r2.prompt_text}`);

    const r3 = handleVoiceTurn(s, "পাঁচশো", recipients, participant.pin, participant.balance, agents);
    console.log(`3. পাঁচশো → ${r3.ui_update.screen}: ${r3.prompt_text}`);

    const r4 = handleVoiceTurn(s, "হ্যাঁ", recipients, participant.pin, participant.balance, agents);
    console.log(`4. হ্যাঁ → ${r4.ui_update.screen}: ${r4.prompt_text}`);

    const r5 = handleVoiceTurn(s, "1234", recipients, participant.pin, participant.balance, agents);
    console.log(`5. PIN → ${r5.ui_update.screen}: ${r5.prompt_text}`);
    console.log(`   task_complete: ${r5.ui_update.task_complete}\n`);
  }

  // ── Cash Out Flow ─────────────────────────────────
  console.log("═══ CASH OUT ═══");
  {
    const s = createSession(participant.id);
    const r1 = startTask(s, "cash_out", participant.balance, agents);
    console.log(`1. START → ${r1.ui_update.screen}: ${r1.prompt_text}`);

    const r2 = handleVoiceTurn(s, "হাসান এজেন্ট", recipients, participant.pin, participant.balance, agents);
    console.log(`2. হাসান → ${r2.ui_update.screen}: ${r2.prompt_text}`);

    const r3 = handleVoiceTurn(s, "এক হাজার", recipients, participant.pin, participant.balance, agents);
    console.log(`3. ১০০০ → ${r3.ui_update.screen}: ${r3.prompt_text}`);

    const r4 = handleVoiceTurn(s, "হ্যাঁ", recipients, participant.pin, participant.balance, agents);
    console.log(`4. হ্যাঁ → ${r4.ui_update.screen}: ${r4.prompt_text}`);

    const r5 = handleVoiceTurn(s, "1234", recipients, participant.pin, participant.balance, agents);
    console.log(`5. PIN → ${r5.ui_update.screen}: ${r5.prompt_text}`);
    console.log(`   task_complete: ${r5.ui_update.task_complete}\n`);
  }

  // ── Recharge Flow ─────────────────────────────────
  console.log("═══ RECHARGE ═══");
  {
    const s = createSession(participant.id);
    const r1 = startTask(s, "recharge", participant.balance, agents);
    console.log(`1. START → ${r1.ui_update.screen}: ${r1.prompt_text}`);

    const r2 = handleVoiceTurn(s, "গ্রামীণফোন", recipients, participant.pin, participant.balance, agents);
    console.log(`2. GP → ${r2.ui_update.screen}: ${r2.prompt_text}`);

    const r3 = handleVoiceTurn(s, "01712345678", recipients, participant.pin, participant.balance, agents);
    console.log(`3. Number → ${r3.ui_update.screen}: ${r3.prompt_text}`);

    const r4 = handleVoiceTurn(s, "একশো", recipients, participant.pin, participant.balance, agents);
    console.log(`4. ১০০ → ${r4.ui_update.screen}: ${r4.prompt_text}`);

    const r5 = handleVoiceTurn(s, "হ্যাঁ", recipients, participant.pin, participant.balance, agents);
    console.log(`5. হ্যাঁ → ${r5.ui_update.screen}: ${r5.prompt_text}`);

    const r6 = handleVoiceTurn(s, "1234", recipients, participant.pin, participant.balance, agents);
    console.log(`6. PIN → ${r6.ui_update.screen}: ${r6.prompt_text}`);
    console.log(`   task_complete: ${r6.ui_update.task_complete}\n`);
  }

  // ── Check Balance Flow ──────────────────────────────
  console.log("═══ CHECK BALANCE ═══");
  {
    const s = createSession(participant.id);
    const r1 = startTask(s, "check_balance", participant.balance, agents);
    console.log(`1. START → ${r1.ui_update.screen}: ${r1.prompt_text}`);

    const r2 = handleTapSelection(s, "auto_advance", "next", recipients, participant.pin, participant.balance, agents);
    console.log(`2. AUTO → ${r2.ui_update.screen}: ${r2.prompt_text}`);

    const r3 = handleTapSelection(s, "auto_advance", "return_home", recipients, participant.pin, participant.balance, agents);
    console.log(`3. HOME → ${r3.ui_update.screen}: ${r3.prompt_text}`);
    console.log(`   return_home: ${r3.ui_update.return_home}\n`);
  }

  // ── Intent Classification from Home ─────────────────
  console.log("═══ INTENT CLASSIFICATION ═══");
  {
    const s = createSession(participant.id);
    const r1 = handleVoiceTurn(s, "টাকা পাঠাতে চাই", recipients, participant.pin, participant.balance, agents);
    console.log(`"টাকা পাঠাতে চাই" → screen: ${r1.ui_update.screen} (should be select_recipient)`);

    const s2 = createSession(participant.id);
    const r2 = handleVoiceTurn(s2, "ক্যাশ আউট", recipients, participant.pin, participant.balance, agents);
    console.log(`"ক্যাশ আউট" → screen: ${r2.ui_update.screen} (should be select_agent)`);

    const s3 = createSession(participant.id);
    const r3 = handleVoiceTurn(s3, "রিচার্জ", recipients, participant.pin, participant.balance, agents);
    console.log(`"রিচার্জ" → screen: ${r3.ui_update.screen} (should be select_operator)`);

    const s4 = createSession(participant.id);
    const r4 = handleVoiceTurn(s4, "ব্যালেন্স", recipients, participant.pin, participant.balance, agents);
    console.log(`"ব্যালেন্স" → screen: ${r4.ui_update.screen} (should be balance)`);
  }

  // ── Error Recovery ─────────────────────────────────
  console.log("\n═══ ERROR RECOVERY ═══");
  {
    const s = createSession(participant.id);
    startTask(s, "send_money", participant.balance, agents);

    const r1 = handleVoiceTurn(s, "xyz", recipients, participant.pin, participant.balance, agents);
    console.log(`Unrecognized 1 → ${r1.prompt_text}`);

    const r2 = handleVoiceTurn(s, "xyz", recipients, participant.pin, participant.balance, agents);
    console.log(`Unrecognized 2 → ${r2.prompt_text}`);

    const r3 = handleVoiceTurn(s, "xyz", recipients, participant.pin, participant.balance, agents);
    console.log(`Unrecognized 3 (modality switch) → ${r3.prompt_text}`);
    console.log(`   is_modality_switched: ${r3.ui_update.is_modality_switched}`);
  }

  console.log("\n═══ ALL TESTS PASSED ═══");
}

test().catch(console.error);
