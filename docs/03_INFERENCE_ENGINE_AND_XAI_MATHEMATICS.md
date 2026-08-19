# Multi-Criteria Decision Engine & Explainable AI (XAI) Mathematics

**Autonomous Perception & Robotic Manipulation Research Laboratory**  
*Mathematical Optimization & XAI Decision Specification*

---

## 1. Motivation: Why Greedy Detection Fails in Physical Robotics

In standard computer vision demos, systems greedily select whichever object has the highest classification confidence ($P(\text{class}) \to 1.0$). In physical robotics manipulation, however, this strategy frequently leads to mechanical damage or grasp failure:
- **Case A (Jaw Clearance Exceeded)**: A bowl detected with $99\%$ confidence may be $18\,\text{cm}$ wide, whereas the physical parallel gripper maximum stroke is only $8\,\text{cm}$. Attempting to grab it results in jaw stall.
- **Case B (Kinematic Singularity / Boundary)**: A cup detected at the extreme edge of the camera view may exceed the manipulator's spherical workspace reach ($R > 0.85\,\text{m}$), causing joint velocity blow-up.
- **Case C (Physical Obstacle Interference)**: An item buried under or touching another object will cause collisions during jaw closure.

To solve this, we implement **Multi-Attribute Utility Theory (MAUT - Keeney & Raiffa, 1993)** combined with an **Explainable AI (XAI)** audit trace.

---

## 2. Mathematical Formulation of the 5 Scoring Criteria

For each candidate object $i \in \{1, \dots, N\}$, the engine evaluates 5 normalized sub-scores $S_k(g_i) \in [0.0, 1.0]$:

### 1. Vision Confidence Metric ($S_1$)
Evaluates neural network posterior probability from the DETR or Qwen-VL model:
$$S_1(g_i) = \text{score}_i \in [0.0, 1.0]$$

---

### 2. Segmentation Mask Quality Metric ($S_2$)
Measures the contour convexity and silhouette completeness:
$$S_2(g_i) = IoU_{\text{mask}}(g_i) = \frac{\text{Area}(\text{Mask Silhouette})}{\text{Area}(\text{Bounding Box})}$$
Penalizes fragmented or highly noisy segmentations.

---

### 3. Gripper Jaw Fit Proximity Metric ($S_3$)
Evaluates whether the object width $w_i$ fits within the physical gripper stroke boundaries $[w_{\text{min}}, w_{\text{max}}]$ (where $w_{\text{min}} = 0.04$, $w_{\text{max}} = 0.28$, and $w_{\text{optimal}} = 0.12$):

$$S_3(g_i) = \begin{cases} 
0.10, & \text{if } w_i < w_{\text{min}} \text{ or } w_i > w_{\text{max}} \\ 
\max\left(0.0, 1.0 - \frac{|w_i - w_{\text{optimal}}|}{w_{\text{max}}}\right), & \text{otherwise} 
\end{cases}$$

---

### 4. Workspace Centering & Manipulability Metric ($S_4$)
Favors objects located near the optical and workspace center $(\bar{c}_x = 0.5, \bar{c}_y = 0.5)$, which maximizes manipulator dexterity and manipulability measure $m(\mathbf{\theta}) = \sqrt{\det(\mathbf{J}\mathbf{J}^T)}$:

$$d_{\text{center}} = \sqrt{(c_{x,i} - 0.5)^2 + (c_{y,i} - 0.5)^2}$$

$$S_4(g_i) = \max\left(0.0, 1.0 - \frac{d_{\text{center}}}{\sqrt{0.5^2 + 0.5^2}}\right) = \max\left(0.0, 1.0 - \frac{d_{\text{center}}}{0.707}\right)$$

---

### 5. Antipodal Orientation Stability Metric ($S_5$)
Evaluates the grasp angle $\theta_i \in [-\pi/2, \pi/2]$ relative to the parallel jaw closing axis, favoring orientations aligned with standard planar tabletop grasp surfaces:

$$S_5(g_i) = \cos(2\theta_i) \cdot 0.5 + 0.5 \in [0.0, 1.0]$$

---

## 3. Collision Risk Sweep & Multiplicative Safety Barrier

Before computing the final score, the engine computes pairwise Intersection-over-Union between all candidate 2D bounding boxes:

$$IoU(B_i, B_j) = \frac{\text{Area}(B_i \cap B_j)}{\text{Area}(B_i \cup B_j)}$$

If $IoU(B_i, B_j) > 0.35$ for any neighboring object $j \ne i$, candidate $i$ is flagged as high collision risk, and a severe safety barrier penalty $\gamma_{\text{coll}} = 0.30$ is applied:

$$\gamma_{\text{coll}}(g_i) = \begin{cases} 0.30, & \text{if } \exists j \ne i \text{ s.t. } IoU(B_i, B_j) > 0.35 \\ 1.00, & \text{otherwise} \end{cases}$$

---

## 4. Final Quality Function & Dynamic Policy Weights

The final Grasp Quality Index $Q(g_i) \in [0\%, 100\%]$ is computed as:

$$Q(g_i) = 100 \cdot \gamma_{\text{coll}}(g_i) \cdot \sum_{k=1}^{5} \bar{w}_k S_k(g_i)$$

Where $\bar{w}_k = \frac{w_k}{\sum_{j=1}^5 w_j}$ are dynamically normalized weights adjusted live via the frontend utility sliders.

---

## 5. Sample Explainable AI (XAI) Reasoning Trace Log

```text
[XAI AUDIT LOG - FRAME #1042]
> Inference Engine initialized: Evaluating 3 candidate object(s).
> Normalized Utility Weights: Vision=0.25, Mask=0.25, Jaw=0.20, Center=0.15, Orient=0.15.
> Evaluating Candidate #1: label='cup', vision_score=0.92, mask_iou=0.86, jaw_fit=0.94, center=0.88, orient=0.95.
  - Collision check: PASSED (Clearance: 100%).
  - Computed Raw Utility: 0.912 -> Total Grasp Quality: 91.2%.
> Evaluating Candidate #2: label='bottle', vision_score=0.88, mask_iou=0.79, jaw_fit=0.75, center=0.62, orient=0.80.
  - Collision check: PASSED (Clearance: 100%).
  - Computed Raw Utility: 0.774 -> Total Grasp Quality: 77.4%.
> Evaluating Candidate #3: label='bowl', vision_score=0.98, mask_iou=0.92, jaw_fit=0.10, center=0.85, orient=0.50.
  - WARNING: Object width (0.34m) exceeds maximum gripper stroke (0.28m).
  - Jaw Fit Score penalized to 0.10.
  - Computed Raw Utility: 0.618 -> Total Grasp Quality: 61.8%.
> SELECTION DECISION: Candidate #1 ('cup') selected as optimal target with Q = 91.2%.
```
