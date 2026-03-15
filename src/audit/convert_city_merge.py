"""
convert_city_merge.py
Converts the nested per-agent/steps format produced by edit_paths.py back into
the flat DraftAuditEvent[] schema that clientLog.ts expects.

Input:  cityMergeDrafts.json  (nested)
Output: cityMergeDrafts.json  (flat, overwrites in place)
"""

import json
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
JSON_PATH  = os.path.join(SCRIPT_DIR, "cityMergeDrafts.json")

# ── helpers ────────────────────────────────────────────────────────────────

def intent_to_type(intent: str) -> str:
    """Map an intent string to OBSERVE / THINK / ACTION."""
    action_intents  = {"Yield", "Wait", "Proceed", "Cross", "Stop"}
    think_intents   = {"Monitor", "Plan", "Decide"}
    if intent in action_intents:
        return "ACTION"
    if intent in think_intents:
        return "THINK"
    return "OBSERVE"

def to_vec3(pos) -> list:
    """Ensure position is always [x, y, z] where y=0.4 (slightly above floor).
    The 2D editor stores [x, z], so we insert y=0.4 as the middle component."""
    if len(pos) == 2:
        return [pos[0], 0.4, pos[1]]
    return list(pos)

# ── load ───────────────────────────────────────────────────────────────────

with open(JSON_PATH, "r") as f:
    raw = json.load(f)

# Detect format: flat (has 'tick') vs nested (has 'steps')
if raw and "tick" in raw[0]:
    print("Already flat format — nothing to convert.")
    raise SystemExit(0)

# ── convert ────────────────────────────────────────────────────────────────
# Interleave steps from all agents: tick = step_index + 1, one event per agent per tick.

n_steps = max(len(agent["steps"]) for agent in raw)
flat: list[dict] = []

for step_idx in range(n_steps):
    for agent in raw:
        steps = agent["steps"]
        if step_idx >= len(steps):
            continue

        step          = steps[step_idx]
        thoughts      = step["thoughts"]
        kinematics    = step["kinematics"]
        intent        = thoughts.get("intent", "Cruise")
        event_type    = intent_to_type(intent)
        pos           = to_vec3(kinematics["position"])

        payload: dict = {
            "thought":    thoughts.get("current", ""),
            "intent":     intent,
            "position":   pos,
        }
        if "confidence" in thoughts:
            payload["confidence"] = thoughts["confidence"]

        flat.append({
            "tick":     step_idx + 1,
            "agent_id": agent["agent_id"],
            "type":     event_type,
            "payload":  payload,
        })

# ── save ───────────────────────────────────────────────────────────────────

with open(JSON_PATH, "w") as f:
    json.dump(flat, f, indent=2)

print(f"Converted {len(flat)} events -> {JSON_PATH}")
for ev in flat:
    print(f"  tick={ev['tick']}  {ev['agent_id']:12s}  {ev['type']:8s}  intent={ev['payload']['intent']!r}")
