# System Architecture & Multi-Stage Processing Pipeline

**Autonomous Perception & Robotic Manipulation Research Laboratory**  
*Technical Architecture & Infrastructure Specification*

---

## 1. High-Level Architecture Overview

The system employs a decoupled, asynchronous microservices architecture that separates the web client, local gateway, cloud neural inference routers, and 3D kinematics engine:

```
+-------------------------------------------------------------------------------------------------------+
|                                         CLIENT WORKSPACE LAYER                                        |
|  [ 🎥 WebRTC Camera Feed ]    [ 📁 Image Dropzone ]    [ 🖼️ Tabletop Presets ]    [ 🎛️ Weight Sliders ] |
+---------------------------------------------------+---------------------------------------------------+
                                                    |
                                       HTTP / WebSocket Payloads (JSON + Base64)
                                                    v
+-------------------------------------------------------------------------------------------------------+
|                                    BACKEND APPLICATION GATEWAY (FastAPI)                              |
|  • vision.py: Dynamic Frame Compression (640px Max Dim) & Coordinate Normalization                    |
|  • inference.py: Multi-Attribute Utility Theory (MAUT) Decision Engine                                |
|  • gemini_client.py: Monocular PnP 6D Spatial Pose Estimator                                          |
|  • benchmarks.py: Automated 10-Scene Evaluation Suite                                                 |
|  • sim_server.py & native_sim.py: 3D Robot Kinematics & PyBullet Direct Engine                        |
+-------------------+-------------------------------+-------------------------------+-------------------+
                    |                               |                               |
       Async HTTPS Requests            Async HTTPS Requests            Local Socket IPC
                    v                               v                               v
+-----------------------+       +-----------------------+       +-----------------------+
| HUGGING FACE CLOUD    |       | GEMINI VISION API     |       | STANDALONE SIMULATOR  |
| • DETR ResNet-50      |       | • Spatial Reasoning   |       | • Franka Panda 7-DOF  |
| • Mask2Former Swin-T  |       | • Metric Geometry     |       | • PyBullet OpenGL GUI |
| • Qwen3-VL 30B VLM    |       | • Orientation Moments |       | • Port 8011 Listener  |
+-----------------------+       +-----------------------+       +-----------------------+
```

---

## 2. Comprehensive Pipeline Stages

### Stage 1: Frame Acquisition & Dynamic Coordinate Normalization
- **Input**: Raw RGB video frames from browser WebRTC `navigator.mediaDevices.getUserMedia` or user-uploaded JPEG/PNG/WEBP files.
- **Dynamic Compression**: High-resolution camera streams ($1920 \times 1080$ or $1280 \times 720$) are compressed on-the-fly to a maximum edge of 640px while preserving the exact native aspect ratio.
- **Normalization Invariant**: All bounding boxes, centroids, and mask silhouettes are strictly mapped to the normalized unit space $[0.0, 1.0]$. This ensures that regardless of network compression, all downstream spatial calculations remain invariant to frame resolution.

---

### Stage 2: Transformer-Based Object Localization (DETR)
- **Model**: `facebook/detr-resnet-50` (Carion et al., ECCV 2020).
- **Inference Mechanism**: Uses a ResNet-50 backbone followed by a Transformer encoder-decoder architecture with bipartite matching loss. Detects 80 everyday categories without needing heuristic non-maximum suppression (NMS).
- **Zero-Shot Alternative**: For open-vocabulary grounding of novel unlabelled objects, requests are routed to `Qwen/Qwen3-VL-30B-A3B-Instruct`, which processes natural language prompts (e.g. *"the red coffee mug next to the scissors"*).

---

### Stage 3: Panoptic Silhouette Segmentation (Mask2Former)
- **Model**: `facebook/mask2former-swin-tiny-coco-panoptic` (Cheng et al., CVPR 2022).
- **Processing**: Extracts pixel-level object boundaries and instance masks. Generates an RGBA mask bitmap whose alpha channel isolates the object silhouette from the background.
- **Mask Quality Metric ($IoU$)**: Compares the pixel mask area against the bounding box bounding area to determine mask convexity and segmentation reliability.

---

### Stage 4: 2D Antipodal Grasp Synthesis & 6D Spatial Pose
- **Antipodal Grasp Plane ($g = \{x, y, \theta, w, q\}$)**:
  - Center $(x, y)$: Computed from the first-order spatial moments of the segmentation mask.
  - Angle $\theta$: Computed from second-order central moments $\mu_{20}, \mu_{02}, \mu_{11}$ along the principal axis of inertia.
  - Width $w$: Computed from the orthogonal span of the object contour.
- **6D Metric Pose $(X, Y, Z, R, P, Y)$**:
  - Distance $Z$: Calculated via pinhole projection ratio $Z = \frac{f \cdot H_{\text{nominal}}}{h_{\text{bbox}}}$.
  - Lateral $X, Y$: Calculated by back-projecting optical center deviations.
  - Euler Angles: Reconstructed from principal axis moments and Gemini 3D spatial reasoning.

---

### Stage 5: Multi-Criteria Decision & Explainable AI (XAI) Engine
- Evaluates candidate objects across 5 competing physical criteria:
  $$\text{Utility} = w_1 S_{\text{vision}} + w_2 S_{\text{mask}} + w_3 S_{\text{jaw}} + w_4 S_{\text{center}} + w_5 S_{\text{orient}}$$
- Executes an **IoU Collision Detection Sweep** between candidate bounding boxes, applying a penalty multiplier $\gamma_{\text{coll}} = 0.30$ if candidate clearance is compromised.
- Outputs human-readable XAI reasoning trace logs explaining the mathematical justification for selecting the optimal target.

---

### Stage 6: 3D Manipulator Kinematics & Physics Simulation
- **Robot Arm**: Franka Emika Panda (7 Revolute Joints + 2-Finger Parallel Gripper).
- **Inverse Kinematics Solver**: Solves Damped Least Squares (DLS) equations to compute joint angle velocities.
- **Trajectory Execution**:
  1. *Hover Phase*: Moves end-effector above target $(Z + 0.25\text{m})$.
  2. *Approach & Jaw Opening*: Expands parallel fingers to nominal width.
  3. *Descent Phase*: Lowers gripper to object height.
  4. *Grip & Contact*: Closes fingers with simulated contact pressure ($12.5\,\text{N}$).
  5. *Lift Phase*: Elevates the target into the air and retracts to home position.

---

## 3. Core REST API Endpoints Specification

| Endpoint | Method | Payload Schema | Description |
| :--- | :--- | :--- | :--- |
| `/api/detect` | `POST` | `DetectRequest` | Main vision pipeline router (Detection, Segmentation, 6D Pose, MAUT Decision). |
| `/api/presets` | `GET` | None | Returns pre-configured tabletop benchmark scenes with ground-truth metadata. |
| `/api/health` | `GET` | None | System health check and API token connectivity diagnostics. |
| `/api/benchmarks/run` | `POST` | None | Executes automated batch benchmark evaluation across 10 tabletop scenes. |
| `/api/sim/step` | `POST` | `SimStepRequest` | Steps 3D PyBullet direct physics simulation and returns synthetic camera frame. |
| `/api/sim/launch-gui` | `POST` | None | Spawns standalone Franka Panda 3D desktop window on host machine. |
| `/api/sim/execute-grasp`| `POST` | `dict` | Forwards $(X, Y, Z, \text{Yaw})$ target command to active desktop simulator window. |
