"""
CBC / Control Barrier Certificate trajectory generator.

For each pair of agents, define the barrier function:
    h_ij(t) = ||p_i(t) - p_j(t)||^2 - d_min^2

Safety condition (CBF):
    dh_ij/dt + alpha * h_ij >= 0    (alpha > 0, class-K function)

Expanding:
    2*(p_i - p_j)^T * (v_i - v_j) + alpha * h_ij >= 0

We solve a QP at each timestep:
    min  ||u_i - u_nom_i||^2   (track nominal control as closely as possible)
    s.t. CBF constraints for all pairs involving agent i

The nominal control drives each agent along its desired lane at desired speed.
"""

import json
import numpy as np
import cvxpy as cp

# -----------------------------------------
# SETTINGS
# -----------------------------------------
DT = 0.1           # simulation timestep (s)
T_TOTAL = 16.0     # total simulation time (s)
D_MIN = 1.5        # minimum separation (m)
ALPHA = 2.0        # CBF class-K gain

N = int(T_TOTAL / DT)
STEP_DURATION = 2  # seconds per JSON step
STEPS_PER_SEG = int(STEP_DURATION / DT)

# -----------------------------------------
# AGENT DEFINITIONS
# Desired lane centerlines and entry points.
# Each agent is a double-integrator in 2D: state = [x, y, vx, vy]
# -----------------------------------------
agents = [
    {
        "agent_id": "car-alpha",
        "lane": "eastbound",
        # Desired: drive east at y = -1.2, target speed vx=5
        "x0": np.array([-20.0, -1.2, 5.0, 0.0]),
        "v_nom": np.array([5.0, 0.0]),
        "lane_y": -1.2,
        "lane_axis": 1,   # fix y
        "thoughts_template": [
            ("Eastbound cruise, lane clear.", "Cruise"),
            ("Intersection ahead, checking for cross traffic.", "Monitor"),
            ("car-delta clearing, proceeding to intersection.", "Approach"),
            ("Crossing intersection.", "Cross"),
            ("Intersection passed, resuming speed.", "Cruise"),
            ("All clear.", "Cruise"),
            ("All clear.", "Cruise"),
            ("All clear.", "Cruise"),
        ]
    },
    {
        "agent_id": "car-beta",
        "lane": "westbound",
        # Desired: drive west at y = +1.2, target speed vx=-5
        "x0": np.array([20.0, 1.2, -5.0, 0.0]),
        "v_nom": np.array([-5.0, 0.0]),
        "lane_y": 1.2,
        "lane_axis": 1,
        "thoughts_template": [
            ("Westbound cruise.", "Cruise"),
            ("Approaching intersection.", "Monitor"),
            ("Crossing intersection.", "Cross"),
            ("Intersection passed.", "Cruise"),
            ("All clear.", "Cruise"),
            ("All clear.", "Cruise"),
            ("All clear.", "Cruise"),
            ("All clear.", "Cruise"),
        ]
    },
    {
        "agent_id": "car-gamma",
        "lane": "southbound",
        # Desired: drive south at x = -1.2, target speed vy=-4
        "x0": np.array([-1.2, 20.0, 0.0, -3.0]),
        "v_nom": np.array([0.0, -3.0]),
        "lane_y": -1.2,
        "lane_axis": 0,
        "thoughts_template": [
            ("Southbound cruise, intersection far ahead.", "Cruise"),
            ("Monitoring E/W traffic volume.", "Observe"),
            ("E/W traffic detected. Yielding.", "Yield"),
            ("Gap confirmed. Proceeding into intersection.", "Proceed"),
            ("Crossing intersection.", "Cross"),
            ("Intersection cleared. Resuming speed.", "Cruise"),
            ("All clear.", "Cruise"),
            ("All clear.", "Cruise"),
        ]
    },
    {
        "agent_id": "car-delta",
        "lane": "northbound",
        # Desired: drive north at x = +1.2, target speed vy=+4
        "x0": np.array([1.2, -16.0, 0.0, 4.0]),
        "v_nom": np.array([0.0, 4.0]),
        "lane_y": 1.2,
        "lane_axis": 0,
        "thoughts_template": [
            ("Northbound cruise.", "Cruise"),
            ("Approaching intersection.", "Monitor"),
            ("Entering intersection. E/W cars at edges.", "Cross"),
            ("Clearing intersection.", "Cross"),
            ("Intersection cleared.", "Cruise"),
            ("All clear.", "Cruise"),
            ("All clear.", "Cruise"),
            ("All clear.", "Cruise"),
        ]
    },
]

n_agents = len(agents)
MAX_ACCEL = 4.0  # m/s^2 max control input

# -----------------------------------------
# SIMULATE WITH CBF-QP
# -----------------------------------------
states = [a["x0"].copy() for a in agents]
trajectories = [[] for _ in range(n_agents)]

for step in range(N):
    t = step * DT
    positions = [s[:2] for s in states]
    velocities = [s[2:] for s in states]

    new_states = []
    new_vels_debug = []

    for i, agent in enumerate(agents):
        u = cp.Variable(2)
        v_nom = agent["v_nom"]

        # Nominal control: PD toward desired velocity + lane correction
        pi = positions[i]
        vi = velocities[i]

        # Proportional lane correction
        lane_axis = agent["lane_axis"]
        lane_center = agent["lane_y"]

        # Nominal: drive to desired speed + correct lane drift
        p_err = np.zeros(2)
        p_err[lane_axis] = pi[lane_axis] - lane_center
        u_nom = (v_nom - vi) * 2.0 - p_err * 1.0  # PD controller

        # Clip nominal control
        u_nom = np.clip(u_nom, -MAX_ACCEL, MAX_ACCEL)

        constraints = [cp.norm(u, "inf") <= MAX_ACCEL]

        # CBF constraints for all other agents
        for j in range(n_agents):
            if j == i:
                continue
            pj = positions[j]
            vj = velocities[j]

            diff = pi - pj
            rel_vel = vi - vj

            h = float(np.dot(diff, diff)) - D_MIN ** 2
            dh_dvi = 2.0 * diff          # grad h w.r.t. vi

            # CBF: dh/dt + alpha*h >= 0
            # dh/dt = 2*diff^T*(vi - vj) + 2*diff^T*(ui)*DT  (linearized)
            # We require: dh_dvi @ u + ALPHA*h + 2*diff@rel_vel >= 0
            lhs = dh_dvi @ u
            rhs_const = -ALPHA * h - 2.0 * float(np.dot(diff, rel_vel))

            constraints.append(lhs >= rhs_const)

        # Solve QP
        objective = cp.Minimize(cp.sum_squares(u - u_nom))
        prob = cp.Problem(objective, constraints)
        try:
            prob.solve(solver=cp.OSQP, warm_starting=True, verbose=False, eps_abs=1e-5, eps_rel=1e-5)
        except Exception:
            pass

        if u.value is not None:
            u_val = np.clip(u.value, -MAX_ACCEL, MAX_ACCEL)
        else:
            u_val = np.zeros(2)

        # Integrate: v += u*DT, p += v*DT
        new_v = vi + u_val * DT
        new_p = pi + new_v * DT
        new_states.append(np.concatenate([new_p, new_v]))

    states = new_states
    for i in range(n_agents):
        trajectories[i].append(states[i][:2].tolist())

# -----------------------------------------
# SAMPLE TRAJECTORIES INTO JSON STEPS
# -----------------------------------------
output = []
n_steps = N // STEPS_PER_SEG + 1

for i, agent in enumerate(agents):
    steps = []
    traj = trajectories[i]

    for s in range(min(8, len(agent["thoughts_template"]))):
        frame_idx = min(s * STEPS_PER_SEG, len(traj) - 1)
        pos = traj[frame_idx]

        # Estimate speed from adjacent frames
        if frame_idx + 1 < len(traj):
            dp = np.array(traj[frame_idx + 1]) - np.array(pos)
            speed = (dp / DT).tolist()
        else:
            speed = [0.0, 0.0]

        thought, intent = agent["thoughts_template"][s]

        steps.append({
            "thoughts": {
                "current": thought,
                "intent": intent,
                "confidence": round(0.88 + 0.01 * s, 2)
            },
            "kinematics": {
                "position": [round(pos[0], 3), round(pos[1], 3)],
                "speed": [round(speed[0], 3), round(speed[1], 3)]
            }
        })

    output.append({"agent_id": agent["agent_id"], "steps": steps})

out_path = "sensaihack-idea1/src/audit/test.json"
with open(out_path, "w") as f:
    json.dump(output, f, indent=4)

print(f"Wrote {out_path}")

# Quick safety check
print("\nMinimum pairwise distances during simulation:")
for i in range(n_agents):
    for j in range(i+1, n_agents):
        min_d = min(
            np.linalg.norm(np.array(trajectories[i][t]) - np.array(trajectories[j][t]))
            for t in range(N)
        )
        flag = "✓" if min_d >= D_MIN else "✗ CRASH"
        print(f"  {agents[i]['agent_id']} <-> {agents[j]['agent_id']}: min dist = {min_d:.3f} m {flag}")
