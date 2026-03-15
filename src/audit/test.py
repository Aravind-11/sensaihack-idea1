import json
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation

# -----------------------------
# SETTINGS
# -----------------------------
TIME_STEP = 0.1   # seconds between frames
STEP_DURATION = 2 # seconds between logged steps

# -----------------------------
# LOAD JSON
# -----------------------------
with open("sensaihack-idea1/src/audit/test.json", "r") as f:
    agents = json.load(f)

# -----------------------------
# PREPARE TRAJECTORIES
# -----------------------------
trajectories = {}

for agent in agents:

    agent_id = agent["agent_id"]
    steps = agent["steps"]

    positions = [np.array(step["kinematics"]["position"]) for step in steps]

    # generate continuous trajectory by linearly interpolating between positions
    traj = []

    for i in range(len(positions) - 1):
        p0 = positions[i]
        p1 = positions[i + 1]

        for dt in np.arange(0, STEP_DURATION, TIME_STEP):
            alpha = dt / STEP_DURATION
            traj.append(p0 + alpha * (p1 - p0))

    trajectories[agent_id] = np.array(traj)

# -----------------------------
# PLOT SETUP
# -----------------------------
fig, ax = plt.subplots()

colors = ["red", "green", "orange", "black"]

scatters = {}

for i,(agent_id,traj) in enumerate(trajectories.items()):
    scatters[agent_id] = ax.scatter([],[], s=500, color=colors[i],label=agent_id)

ax.set_xlim(-8, 8)
ax.set_ylim(-8, 8)
ax.set_xlabel("X Position")
ax.set_ylabel("Y Position")
ax.legend()
ax.grid()

# -----------------------------
# ANIMATION FUNCTION
# -----------------------------
def update(frame):

    for agent_id,traj in trajectories.items():

        if frame < len(traj):
            x,y = traj[frame]
            scatters[agent_id].set_offsets([[x,y]])

    return scatters.values()

frames = max(len(t) for t in trajectories.values())

ani = FuncAnimation(
    fig,
    update,
    frames=frames,
    interval=TIME_STEP*1000
)

plt.show()