import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import type { TaskPlan } from "./types.js";

const PLANS_DIR = join(import.meta.dirname, "../../plans");
const PROMPTS_PATH = join(import.meta.dirname, "../../prompts/prompts_bn.json");

let plans: Map<string, TaskPlan>;
let prompts: Record<string, string>;

export function loadPlans(): void {
  plans = new Map();
  prompts = JSON.parse(readFileSync(PROMPTS_PATH, "utf-8"));

  const files = readdirSync(PLANS_DIR).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    const plan: TaskPlan = JSON.parse(
      readFileSync(join(PLANS_DIR, file), "utf-8")
    );
    validatePlan(plan);
    plans.set(plan.task_type, plan);
  }

  console.log(
    `Loaded ${plans.size} plans: ${[...plans.keys()].join(", ")}`
  );
  console.log(`Loaded ${Object.keys(prompts).length} Bangla prompts`);
}

function validatePlan(plan: TaskPlan): void {
  for (const stage of plan.stages) {
    if (!prompts[stage.primary_prompt_id]) {
      console.warn(
        `Plan ${plan.plan_id}: prompt "${stage.primary_prompt_id}" not found in prompts_bn.json`
      );
    }

    if (!stage.branches["cancelled"] && stage.expected_input_type !== "none") {
      console.warn(
        `Plan ${plan.plan_id}, stage ${stage.stage_id}: missing "cancelled" branch`
      );
    }

    for (const [key, branch] of Object.entries(stage.branches)) {
      if (branch.next_stage) {
        const target = plan.stages.find((s) => s.stage_id === branch.next_stage);
        if (!target) {
          throw new Error(
            `Plan ${plan.plan_id}, stage ${stage.stage_id}, branch ${key}: next_stage "${branch.next_stage}" not found`
          );
        }
      }
      if (branch.prompt_id && !prompts[branch.prompt_id]) {
        console.warn(
          `Plan ${plan.plan_id}, stage ${stage.stage_id}, branch ${key}: prompt "${branch.prompt_id}" not found`
        );
      }
    }
  }
}

export function getPlan(taskType: string): TaskPlan | undefined {
  return plans.get(taskType);
}

export function getAllPlanTypes(): string[] {
  return [...plans.keys()];
}

export function resolvePrompt(
  promptId: string,
  vars: Record<string, string | number> = {}
): string {
  let text = prompts[promptId];
  if (!text) {
    console.warn(`Prompt "${promptId}" not found, using fallback`);
    return prompts["generic.not_understood"] ?? "বুঝতে পারিনি।";
  }
  for (const [key, value] of Object.entries(vars)) {
    text = text.replace(new RegExp(`\\{${key}\\}`, "g"), String(value));
  }
  return text;
}

export function getPrompts(): Record<string, string> {
  return prompts;
}
