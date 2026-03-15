import json
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
JSON_PATH  = os.path.join(SCRIPT_DIR, "cityMergeDrafts.json")

def negate_xz():
    if not os.path.exists(JSON_PATH):
        print(f"Error: {JSON_PATH} not found.")
        return

    with open(JSON_PATH, "r") as f:
        data = json.load(f)

    for event in data:
        if "payload" in event and "position" in event["payload"]:
            pos = event["payload"]["position"]
            if len(pos) >= 3:
                # Negate X (index 0) and Z (index 2)
                # Keep Y (index 1, constant 0.4) as is
                pos[0] = -pos[0]
                pos[2] = -pos[2]

    with open(JSON_PATH, "w") as f:
        json.dump(data, f, indent=4)
    
    print(f"[negate_xz] Done! Negated X and Z for {len(data)} events in {JSON_PATH}")

if __name__ == "__main__":
    negate_xz()
