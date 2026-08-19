# 7-DOF Robotic Kinematics & 3D Simulation Guide

**Autonomous Perception & Robotic Manipulation Research Laboratory**  
*Manipulator Kinematics & Physics Simulation Specification*

---

## 1. Franka Emika Panda Manipulator Specification

The system models the industry-standard **Franka Emika Panda 7-DOF Robotic Arm** with an integrated 2-finger parallel jaw gripper.

### Kinematic Specifications:
- **Degrees of Freedom (DOF)**: 7 Revolute Joints ($q_1, q_2, q_3, q_4, q_5, q_6, q_7$).
- **End-Effector**: Parallel Gripper (Fingers: $q_8, q_9$ with maximum stroke $0.08\,\text{m}$).
- **Maximum Reach**: $0.855\,\text{m}$.
- **Payload Capacity**: $3.0\,\text{kg}$.
- **Joint Position Limits**:
  - $q_1 \in [-166^\circ, +166^\circ]$ (Base Yaw)
  - $q_2 \in [-101^\circ, +101^\circ]$ (Shoulder Pitch)
  - $q_3 \in [-166^\circ, +166^\circ]$ (Shoulder Roll)
  - $q_4 \in [-176^\circ, -4^\circ]$ (Elbow Pitch)
  - $q_5 \in [-166^\circ, +166^\circ]$ (Wrist Yaw)
  - $q_6 \in [-1^\circ, +215^\circ]$ (Wrist Pitch)
  - $q_7 \in [-166^\circ, +166^\circ]$ (Flange Roll)

---

## 2. Inverse Kinematics (IK) Formulations

### Forward Kinematics
For joint configuration $\mathbf{q} = [q_1, \dots, q_7]^T \in \mathbb{R}^7$, the end-effector homogeneous transformation $\mathbf{T}_e^0(\mathbf{q}) \in SE(3)$ is given by the product of individual joint transformation matrices:

$$\mathbf{T}_e^0(\mathbf{q}) = \mathbf{T}_1^0(q_1) \mathbf{T}_2^1(q_2) \dots \mathbf{T}_7^6(q_7) \mathbf{T}_e^7$$

### Differential Kinematics & Analytical Jacobian
The end-effector linear and angular velocity $\mathbf{v}_e = [\dot{\mathbf{p}}_e^T, \mathbf{\omega}_e^T]^T \in \mathbb{R}^6$ relates to joint velocities $\dot{\mathbf{q}}$ via the $6 \times 7$ Jacobian matrix $\mathbf{J}(\mathbf{q})$:

$$\mathbf{v}_e = \mathbf{J}(\mathbf{q}) \dot{\mathbf{q}}$$

$$\mathbf{J}_i(\mathbf{q}) = \begin{bmatrix} \mathbf{z}_{i-1} \times (\mathbf{p}_e - \mathbf{p}_{i-1}) \\ \mathbf{z}_{i-1} \end{bmatrix}$$

### Damped Least Squares Numerical Inversion
Near singular configurations (e.g. fully outstretched arm or wrist alignment), the standard pseudo-inverse $\mathbf{J}^\dagger = \mathbf{J}^T (\mathbf{J}\mathbf{J}^T)^{-1}$ approaches infinite joint velocities. We employ the **Damped Least Squares (DLS)** formulation:

$$\dot{\mathbf{q}} = \mathbf{J}^T (\mathbf{J} \mathbf{J}^T + \lambda^2 \mathbf{I}_{6 \times 6})^{-1} \mathbf{e}$$

Where $\mathbf{e} = [\mathbf{p}_{\text{target}} - \mathbf{p}_{\text{current}}, \mathbf{\phi}_{\text{error}}]^T$ and $\lambda = 0.05$ ensures smooth, bounded physical velocities.

---

## 3. Physical Grasp Trajectory (5-Phase State Machine)

```
[ PHASE 1: APPROACH ] -> [ PHASE 2: FINGER OPEN ] -> [ PHASE 3: DESCEND ] -> [ PHASE 4: GRIP & CONTACT ] -> [ PHASE 5: ELEVATE & RETRACT ]
  End-Effector moves       Jaws expand to 40mm        Lowers along Z-axis      Jaws close with 12.5N force     Object lifted +25cm into air
  above (X, Y, Z+0.25m)                               to object height Z       Friction contact verified       Arm returns to home pose
```

---

## 4. Dual Simulation Engines

1. **Browser 3D Canvas / WebGL Engine (`RobotSim3D.jsx` & `PyBulletStudio.jsx`)**:
   - Zero local dependencies, runs on any browser and low-power laptop.
   - Interactive mouse orbit drag controls for 360-degree viewpoint inspection.
   - Real-time animated DLS joint trajectory and contact force telemetry.

2. **PyBullet Native 3D Engine (`sim_server.py` & `native_sim.py`)**:
   - Uses Erwin Coumans' PyBullet physics library (Bullet 3.2 physics engine).
   - Simulates rigid-body mass, table friction, contact normal forces ($N$), and joint motor torque limits.
