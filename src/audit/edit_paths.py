"""
edit_paths.py — Interactive spline path editor for test.json
  • Drag any control point (timestep) to reshape a car's path
  • Splines are recomputed live using CubicSpline
  • Click "Save to JSON" to write positions back to test.json
  • Click "Reload JSON" to discard changes and reload from disk
"""

import json
import os
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.widgets import Button
from scipy.interpolate import CubicSpline

from collections import defaultdict

# ── Paths ────────────────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
JSON_PATH  = os.path.join(SCRIPT_DIR, "cityMergeDrafts.json")

# ── Car colours (match test.py) ───────────────────────────────────────────────
CAR_COLORS = {
    "car-alpha": "red",
    "car-beta":  "green",
    "car-gamma": "orange",
    "car-delta": "black",
}
DEFAULT_COLOR = "blue"

PICK_RADIUS   = 0.35   # world-unit snap radius for clicking a control point
SPLINE_STEPS  = 300    # resolution of the rendered spline
SNAP_INTERVAL = 0.5    # snap to grid increment

def snap(val):
    return round(val / SNAP_INTERVAL) * SNAP_INTERVAL

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def load_json():
    with open(JSON_PATH, "r") as f:
        return json.load(f)

def save_json(raw_data):
    with open(JSON_PATH, "w") as f:
        json.dump(raw_data, f, indent=4)
    print(f"[edit_paths] Saved -> {JSON_PATH}")

def spline_curve(positions):
    """Return a (SPLINE_STEPS, 2) array interpolating the waypoints."""
    pts = np.array(positions, dtype=float)
    n   = len(pts)
    if n < 2:
        return pts
    t      = np.arange(n, dtype=float)
    t_fine = np.linspace(0, n - 1, SPLINE_STEPS)
    if n == 2:
        # Simple linear for only 2 points
        return np.column_stack([
            np.interp(t_fine, t, pts[:, 0]),
            np.interp(t_fine, t, pts[:, 1]),
        ])
    cs_x = CubicSpline(t, pts[:, 0])
    cs_y = CubicSpline(t, pts[:, 1])
    return np.column_stack([cs_x(t_fine), cs_y(t_fine)])

# ─────────────────────────────────────────────────────────────────────────────
# Figure setup
# ─────────────────────────────────────────────────────────────────────────────

fig, ax = plt.subplots(figsize=(9, 9))
plt.subplots_adjust(bottom=0.12)

ax.set_aspect("equal")
ax.set_xlim(-16, 16)
ax.set_ylim(-16, 16)
ax.set_xlabel("X", fontsize=11)
ax.set_ylabel("Y", fontsize=11)
ax.set_title("Path Editor (+Z is Down) – drag dots • Save writes to JSON", fontsize=11)
ax.invert_yaxis()  # Match app truth: smaller Z is visual "Up/Forward"
ax.grid(True, alpha=0.25, linestyle="--")

# Intersection marker
ax.axhline(0, color="gray", lw=0.6, alpha=0.4)
ax.axvline(0, color="gray", lw=0.6, alpha=0.4)

# Lay-lines (tracks) at ±1
for val in [-1, 1]:
    ax.axhline(val, color="blue", lw=0.8, alpha=0.15, linestyle="--")
    ax.axvline(val, color="blue", lw=0.8, alpha=0.15, linestyle="--")

ax.plot(0, 0, "k+", ms=14, mew=2, alpha=0.35, zorder=0)

# Hover annotation
hover_annot = ax.annotate("", xy=(0,0), xytext=(10,10),
                          textcoords="offset points",
                          bbox=dict(boxstyle="round", fc="w", ec="gray", alpha=0.9),
                          arrowprops=dict(arrowstyle="->"))
hover_annot.set_visible(False)

# ─────────────────────────────────────────────────────────────────────────────
# Per-agent visual state
# ─────────────────────────────────────────────────────────────────────────────

agent_data = {}   # agent_id → dict of mpl objects + live data
last_selected_aid = None

def build_visuals(flat_list):
    """Create / recreate all matplotlib artists from flat JSON list."""
    global last_selected_aid
    
    # Clear any existing artists
    for d in agent_data.values():
        d["line"].remove()
        d["scatter"].remove()
        for lbl in d["labels"]: lbl.remove()
        if "markers" in d:
            for m in d["markers"]: m.remove()
            
    agent_data.clear()

    # Group by agent_id while preserving tick order
    by_agent = defaultdict(list)
    for event in flat_list:
        aid = event["agent_id"]
        # event is the full dict from JSON. We keep it to preserve metadata.
        by_agent[aid].append(event)

    for aid, events in by_agent.items():
        color = CAR_COLORS.get(aid, DEFAULT_COLOR)
        
        # Get [x, z] from events
        positions = []
        for ev in events:
            p3d = ev["payload"]["position"]
            positions.append([p3d[0], p3d[2]])
            
        pts = np.array(positions)

        # Spline curve
        sp    = spline_curve(positions)
        line, = ax.plot(sp[:, 0], sp[:, 1], color=color, lw=2.2, zorder=1,
                        solid_capstyle="round")

        # Control points (waypoints)
        sc = ax.scatter(pts[:, 0], pts[:, 1], s=120, color=color, zorder=4,
                        edgecolors="white", linewidths=1.8)

        # Step-index labels
        labels = []
        for i, p in enumerate(positions):
            lbl = ax.text(p[0] + 0.12, p[1] + 0.12, str(i),
                          fontsize=8, color=color, zorder=5,
                          fontweight="bold")
            labels.append(lbl)

        # Start / end markers
        m1, = ax.plot(*positions[0],  marker="s", ms=9, color=color, zorder=5,
                   markeredgecolor="white", markeredgewidth=1.2)
        m2, = ax.plot(*positions[-1], marker="*", ms=13, color=color, zorder=5,
                   markeredgecolor="white", markeredgewidth=0.8)

        agent_data[aid] = {
            "line":      line,
            "scatter":   sc,
            "labels":    labels,
            "markers":   [m1, m2],
            "positions": positions, # these are [x, z] lists
            "events":    events,    # list of AuditEvent dicts
            "color":     color,
        }

    # Legend
    patches = [mpatches.Patch(color=d["color"], label=aid)
               for aid, d in agent_data.items()]
    ax.legend(handles=patches, loc="upper right", fontsize=9,
              framealpha=0.85)
    fig.canvas.draw_idle()

# Initial draw
build_visuals(load_json())

# ─────────────────────────────────────────────────────────────────────────────
# Interaction logic (Drag & Delete)
# ─────────────────────────────────────────────────────────────────────────────

drag = {"aid": None, "idx": None}

def on_press(event):
    global last_selected_aid
    if event.inaxes is not ax:
        return
        
    # Find closest point
    best_dist, best_aid, best_idx = PICK_RADIUS, None, None
    for aid, data in agent_data.items():
        for i, pos in enumerate(data["positions"]):
            d = np.hypot(pos[0] - event.xdata, pos[1] - event.ydata)
            if d < best_dist:
                best_dist, best_aid, best_idx = d, aid, i

    # CASE 1: Delete (Right Click)
    if event.button == 3 and best_aid:
        print(f"[edit_paths] Deleting step {best_idx} from {best_aid}")
        data = agent_data[best_aid]
        if len(data["positions"]) <= 2:
            print("Warning: Cannot delete below 2 waypoints.")
            return
        data["positions"].pop(best_idx)
        data["events"].pop(best_idx)
        refresh_agent(best_aid)
        return

    # CASE 2: Select/Drag (Left Click)
    if event.button == 1:
        drag["aid"] = best_aid
        drag["idx"] = best_idx
        if best_aid:
            last_selected_aid = best_aid
            # Reset highlight on all
            for aid, d in agent_data.items():
                d["scatter"].set_linewidths(1.8)
            # Highlight selected
            agent_data[best_aid]["scatter"].set_linewidths(3.5)
            ax.set_title(f"Selected: {best_aid} (drag to move, right-click to delete)", 
                         fontsize=11, color=agent_data[best_aid]["color"])
        fig.canvas.draw_idle()

def on_motion(event):
    if event.inaxes is not ax:
        return
        
    # --- Part 1: Dragging logic ---
    if drag["aid"] is not None:
        if event.xdata is None or event.ydata is None:
            return

        aid, idx = drag["aid"], drag["idx"]
        data = agent_data[aid]
        
        # Snap to grid
        snapped_x = snap(event.xdata)
        snapped_y = snap(event.ydata)
        
        data["positions"][idx] = [snapped_x, snapped_y]
        
        # Update event object position [x, 0.4, z]
        data["events"][idx]["payload"]["position"] = [
            round(snapped_x, 4), 
            0.4, 
            round(snapped_y, 4)
        ]

        refresh_agent(aid)
        
    # --- Part 2: Hover logic (show coordinates) ---
    found_hover = False
    if event.xdata is not None and event.ydata is not None:
        for aid, data in agent_data.items():
            for i, pos in enumerate(data["positions"]):
                if np.hypot(pos[0] - event.xdata, pos[1] - event.ydata) < PICK_RADIUS:
                    hover_annot.xy = (pos[0], pos[1])
                    # Format as (x, z) - recall z is the y-axis in 2D editor
                    hover_annot.set_text(f"({pos[0]:.1f}, {pos[1]:.1f})")
                    hover_annot.set_visible(True)
                    found_hover = True
                    break
            if found_hover: break
            
    if not found_hover:
        hover_annot.set_visible(False)
        
    fig.canvas.draw_idle()

def on_release(event):
    drag["aid"] = None
    drag["idx"] = None

def refresh_agent(aid):
    """Update artists for a specific agent after pos change or deletion."""
    data = agent_data[aid]
    pos  = data["positions"]
    pts  = np.array(pos)
    
    # Update scatter
    data["scatter"].set_offsets(pts)
    
    # Redraw spline
    sp = spline_curve(pos)
    data["line"].set_data(sp[:, 0], sp[:, 1])
    
    # Update labels (clear and rebuild if count changed, or just move)
    if len(data["labels"]) != len(pos):
        for lbl in data["labels"]: lbl.remove()
        data["labels"] = []
        for i, p in enumerate(pos):
            lbl = ax.text(p[0] + 0.12, p[1] + 0.12, str(i),
                          fontsize=8, color=data["color"], zorder=5, fontweight="bold")
            data["labels"].append(lbl)
    else:
        for i, p in enumerate(pos):
            data["labels"][i].set_position((p[0] + 0.12, p[1] + 0.12))
            
    # Update markers
    data["markers"][0].set_data([pos[0][0]], [pos[0][1]])
    data["markers"][1].set_data([pos[-1][0]], [pos[-1][1]])
    
    fig.canvas.draw_idle()

fig.canvas.mpl_connect("button_press_event",   on_press)
fig.canvas.mpl_connect("motion_notify_event",  on_motion)
fig.canvas.mpl_connect("button_release_event", on_release)

# ─────────────────────────────────────────────────────────────────────────────
# Buttons
# ─────────────────────────────────────────────────────────────────────────────

ax_add    = plt.axes([0.15, 0.025, 0.15, 0.055])
ax_save   = plt.axes([0.35, 0.025, 0.18, 0.055])
ax_reload = plt.axes([0.55, 0.025, 0.18, 0.055])

btn_add    = Button(ax_add,    "+ Step",        color="#FFCCFF", hovercolor="#FF66FF")
btn_save   = Button(ax_save,   "Save to JSON",  color="#90EE90", hovercolor="#32CD32")
btn_reload = Button(ax_reload, "Reload JSON",    color="#ADD8E6", hovercolor="#4169E1")

def on_add(event):
    global last_selected_aid
    if not last_selected_aid:
        print("Select an agent first by clicking one of its points.")
        return
    
    data = agent_data[last_selected_aid]
    last_p = data["positions"][-1]
    last_ev = data["events"][-1]
    
    # Create new position offset slightly and snapped
    new_p = [snap(last_p[0] + 0.5), snap(last_p[1] + 0.5)]
    
    # Create new event based on last one
    import copy
    new_ev = copy.deepcopy(last_ev)
    new_ev["payload"]["position"] = [new_p[0], 0.4, new_p[1]]
    new_ev["payload"]["thought"] = "New step added."
    
    data["positions"].append(new_p)
    data["events"].append(new_ev)
    
    print(f"[edit_paths] Added step to {last_selected_aid}")
    refresh_agent(last_selected_aid)

def on_save(event):
    # Rebuild flat list from grouped events
    # Interleave based on step index (Tick 1: all agents, then Tick 2...)
    max_steps = max(len(d["events"]) for d in agent_data.values())
    flat_rebuilt = []
    
    for i in range(max_steps):
        for aid in sorted(agent_data.keys()):
            events = agent_data[aid]["events"]
            if i < len(events):
                ev = events[i]
                ev["tick"] = i + 1  # Re-normalize ticks
                flat_rebuilt.append(ev)
        
    save_json(flat_rebuilt)
    ax.set_title("✔ Saved! – order: sequential ticks", fontsize=11, color="green")
    fig.canvas.draw_idle()

def on_reload(event):
    build_visuals(load_json())
    ax.set_title("Path Editor (Flat JSON) – drag dots • Save writes to JSON",
                 fontsize=11, color="black")
    fig.canvas.draw_idle()

btn_add.on_clicked(on_add)
btn_save.on_clicked(on_save)
btn_reload.on_clicked(on_reload)

# ─────────────────────────────────────────────────────────────────────────────
plt.show()

