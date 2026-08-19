# Cloud-Native Monocular 6D Pose Estimation and Explainable Multi-Attribute Utility Grasping for Robotic Manipulation

**Autonomous Perception & Robotic Manipulation Research Laboratory**  
*Technical Research Report & Methodology Specification*

---

## 1. Abstract

Robotic tabletop manipulation in unstructured environments traditionally relies on heavy, GPU-intensive edge workstations equipped with active RGB-D sensors (structured light or LiDAR). However, resource-constrained mobile robots, educational arms, and embedded manipulators often lack discrete hardware acceleration. 

In this work, we present a **Cloud-Native Autonomous Vision-Guided Manipulation Architecture** that achieves real-time object detection, panoptic segmentation, monocular 6D spatial pose estimation, and explainable antipodal grasp planning using standard monocular RGB camera streams. By decoupling heavy vision-language transformer models (`DETR`, `Mask2Former`, `Qwen-VL`) from physical manipulator control and implementing a **Multi-Attribute Utility Theory (MAUT)** decision engine, our system reliably identifies, ranks, and physically manipulates target objects on a 7-DOF Franka Emika Panda arm with zero local GPU requirements.

---

## 2. Research Aim & Key Contributions

### Primary Research Objectives:
1. **Cloud-Native Visual Perception**: Offload computational overhead of heavy vision transformers (DETR ResNet-50 and Mask2Former Swin-T) to cloud microservices while maintaining low-latency visual servoing.
2. **Monocular 6D Spatial Pose Estimation**: Reconstruct metric Cartesian depth $(X, Y, Z)$ and Euler rotational angles $(\text{Roll}, \text{Pitch}, \text{Yaw})$ from single 2D RGB frames using calibrated pinhole projective geometry without physical depth sensors.
3. **Explainable AI (XAI) Grasp Quality Optimization**: Replace heuristic "highest detection score" selection with a multi-criteria utility function evaluating vision confidence, mask polygon fidelity, physical gripper jaw clearance, workspace reachability, and collision penalty.
4. **Interactive 3D Kinematics Simulation**: Provide real-time Damped Least Squares (DLS) Inverse Kinematics simulation of a 7-DOF manipulator directly inside a browser-based WebGL suite.

---

## 3. Mathematical Formulations & Methodology

### 3.1 Pinhole Projective Geometry & 3D Depth Reconstruction
Given a calibrated intrinsic camera matrix $\mathbf{K} \in \mathbb{R}^{3 \times 3}$:

$$\mathbf{K} = \begin{bmatrix} f_x & 0 & c_x \\ 0 & f_y & c_y \\ 0 & 0 & 1 \end{bmatrix}$$

For a detected object category with nominal real-world physical height $H_{\text{nominal}}$ and bounding box normalized pixel height $h_{\text{bbox}} \in (0, 1]$, metric distance along the optical $Z$-axis is reconstructed as:

$$Z = \frac{f \cdot H_{\text{nominal}}}{h_{\text{bbox}}}$$

The lateral $X$ and vertical $Y$ workspace coordinates in the camera coordinate frame are then determined by back-projection:

$$X = \frac{(c_x - 0.5) \cdot Z}{f}, \quad Y = \frac{(c_y - 0.5) \cdot Z}{f}$$

---

### 3.2 Second-Order Polygon Inertial Moments (2D Grasp Synthesis)
From the binary silhouette mask $M(u, v) \in \{0, 1\}$, the spatial centroid $(\bar{u}, \bar{v})$ is computed from zeroth and first-order moments:

$$m_{00} = \sum_{u} \sum_{v} M(u, v), \quad m_{10} = \sum_{u} \sum_{v} u M(u, v), \quad m_{01} = \sum_{u} \sum_{v} v M(u, v)$$

$$\bar{u} = \frac{m_{10}}{m_{00}}, \quad \bar{v} = \frac{m_{01}}{m_{00}}$$

The principal orientation angle $\theta \in [-\pi/2, \pi/2]$ of the minimum-area grasp axis is derived from second-order central moments:

$$\mu_{20} = \sum (u - \bar{u})^2 M(u, v), \quad \mu_{02} = \sum (v - \bar{v})^2 M(u, v), \quad \mu_{11} = \sum (u - \bar{u})(v - \bar{v}) M(u, v)$$

$$\theta = \frac{1}{2} \arctan \left( \frac{2 \mu_{11}}{\mu_{20} - \mu_{02}} \right)$$

---

### 3.3 Multi-Attribute Utility Grasp Quality Index ($Q$)
Rather than greedily choosing the candidate with the highest classification probability, the inference engine solves a constrained multi-objective optimization problem:

$$Q(g_i) = \gamma_{\text{coll}} \cdot \sum_{k=1}^{5} w_k S_k(g_i), \quad \text{subject to } \sum_{k=1}^{5} w_k = 1.0, \quad w_k \ge 0$$

Where:
- $S_1(g_i) \in [0, 1]$: Vision Detection Confidence Score.
- $S_2(g_i) \in [0, 1]$: Mask Overlap & Contour Quality ($IoU$).
- $S_3(g_i) \in [0, 1]$: Physical Gripper Jaw Clearance Proximity ($1 - \frac{|w - w_{\text{opt}}|}{w_{\text{max}}}$).
- $S_4(g_i) \in [0, 1]$: Workspace Centering & Manipulability Measure ($1 - \frac{d_{\text{center}}}{d_{\text{max}}}$).
- $S_5(g_i) \in [0, 1]$: Antipodal Orientation Stability ($\cos(2\theta) \cdot 0.5 + 0.5$).
- $\gamma_{\text{coll}} \in \{0.30, 1.0\}$: Binary Collision Penalty Factor applied when bounding box IoU exceeds the interference threshold ($IoU_{\text{coll}} > 0.35$).

---

### 3.4 Damped Least Squares Inverse Kinematics (DLS)
To calculate 7-DOF joint angle displacements $\Delta \mathbf{\theta}$ toward Cartesian end-effector error $\mathbf{e} = \mathbf{x}_{\text{target}} - \mathbf{x}_{\text{current}}$ while avoiding kinematic singularities near workspace boundaries:

$$\Delta \mathbf{\theta} = \mathbf{J}^T (\mathbf{J} \mathbf{J}^T + \lambda^2 \mathbf{I})^{-1} \mathbf{e}$$

Where $\mathbf{J} \in \mathbb{R}^{6 \times 7}$ represents the analytical manipulator Jacobian and $\lambda \in \mathbb{R}^+$ is the non-zero damping coefficient.

---

## 4. Academic Bibliography & Literature References

1. **Carion, N., Massa, F., Synnaeve, G., Usunier, N., Kirillov, A., & Zagoruyko, S.** (2020). *End-to-End Object Detection with Transformers*. In European Conference on Computer Vision (ECCV 2020), pp. 213-229. DOI: `10.1007/978-3-030-58452-8_13`.
2. **Cheng, B., Misra, I., Schwing, A. G., Kirillov, A., & Girdhar, R.** (2022). *Masked-attention Mask Transformer for Universal Image Segmentation*. In IEEE/CVF Conference on Computer Vision and Pattern Recognition (CVPR 2022), pp. 1290-1299. DOI: `10.1109/CVPR52688.2022.00135`.
3. **Morrison, D., Corke, P., & Leitner, J.** (2018). *Closing the Loop for Robotic Grasping: A Real-time, Generative Grasp Synthesis Approach*. In Robotics: Science and Systems (RSS 2018). DOI: `10.1177/0278364920908277`.
4. **Coumans, E., & Bai, Y.** (2016-2021). *PyBullet, a Python module for physics simulation for games, robotics and machine learning*. `http://pybullet.org`.
5. **Hartley, R., & Zisserman, A.** (2004). *Multiple View Geometry in Computer Vision (2nd ed.)*. Cambridge University Press. DOI: `10.1017/CBO9780511811685`.
6. **Keeney, R. L., & Raiffa, H.** (1993). *Decisions with Multiple Objectives: Preferences and Value Trade-Offs*. Cambridge University Press. DOI: `10.1017/CBO9780511983832`.
7. **Zhang, Z.** (2000). *A flexible new technique for camera calibration*. IEEE Transactions on Pattern Analysis and Machine Intelligence (TPAMI), 22(11), pp. 1330-1334. DOI: `10.1109/34.888718`.
