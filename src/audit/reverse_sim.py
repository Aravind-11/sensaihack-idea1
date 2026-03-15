import json
import os
from collections import defaultdict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
JSON_PATH  = os.path.join(SCRIPT_DIR, "cityMergeDrafts.json")

def reverse_sim():
    if not os.path.exists(JSON_PATH):
        print(f"Error: {JSON_PATH} not found.")
        return

    with open(JSON_PATH, "r") as f:
        data = json.load(f)

    # 1. Group by agent
    by_agent = defaultdict(list)
    for event in data:
        aid = event["agent_id"]
        by_agent[aid].append(event)

    # 2. Reverse each agent's sequence
    for aid in by_agent:
        by_agent[aid].reverse()
        print(f"[reverse_sim] Reversed {len(by_agent[aid])} steps for {aid}")

    # 3. Re-interleave and re-tick
    max_steps = max(len(steps) for steps in by_agent.values())
    flat_rebuilt = []
    
    for i in range(max_steps):
        for aid in sorted(by_agent.keys()):
            steps = by_agent[aid]
            if i < len(steps):
                ev = steps[i]
                ev["tick"] = i + 1  # Re-normalize ticks to be 1, 2, 3...
                flat_rebuilt.append(ev)

    # 4. Save back
    with open(JSON_PATH, "w") as f:
        json.dump(flat_rebuilt, f, indent=4)
    
    print(f"[reverse_sim] Done! Re-interleaved {len(flat_rebuilt)} events into {JSON_PATH}")

if __name__ == "__main__":
    reverse_sim()
