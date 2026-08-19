# Autonomous Vision-Guided Robotic Manipulation & Visual Servoing Suite

**Autonomous Perception & Robotic Manipulation Research Laboratory**  
*Cloud-Native Monocular 6D Pose Estimation, Panoptic Segmentation, and Explainable Multi-Attribute Utility Grasping*

---

## 📚 Technical Research & System Documentation Index

The complete academic and engineering documentation for this project is modularly organized in the [`docs/`](./docs) directory:

0. [**⭐ 07. Master System Documentation & Technical Workflow Paper**](./docs/07_MASTER_SYSTEM_DOCUMENTATION_AND_WORKFLOW.md)
   - **All-in-one comprehensive research paper**: End-to-end mathematical derivations, Multi-Criteria XAI Decision Engine, FoundationPose Cloud GPU pipeline, 6 research studios, and complete viva voce guide.
1. [**01. Research Paper Abstract & Theoretical Methodology**](./docs/01_RESEARCH_PAPER_ABSTRACT_AND_METHODOLOGY.md)
   - Research objectives, monocular projective geometry proofs, moment analysis, MAUT formulation, and peer-reviewed literature citations.
2. [**02. System Architecture & Multi-Stage Processing Pipeline**](./docs/02_SYSTEM_ARCHITECTURE_AND_PIPELINE.md)
   - Microservices topology, coordinate normalization invariant, REST API schemas, and data flow.
3. [**03. Multi-Criteria Decision Engine & XAI Mathematics**](./docs/03_INFERENCE_ENGINE_AND_XAI_MATHEMATICS.md)
   - Detailed derivation of the 5 scoring sub-criteria ($S_1 \dots S_5$), collision avoidance penalty $\gamma_{\text{coll}}$, and XAI audit logs.
4. [**04. 7-DOF Robotic Kinematics & 3D Simulation Guide**](./docs/04_ROBOTIC_KINEMATICS_AND_SIMULATION_GUIDE.md)
   - Franka Emika Panda DH parameters, Damped Least Squares (DLS) Inverse Kinematics, and 5-phase pick-and-place state machine.
5. [**05. Dataset Benchmarks & Empirical Evaluation Results**](./docs/05_DATASET_BENCHMARK_AND_EXPERIMENTAL_RESULTS.md)
   - Quantitative evaluation across 10 tabletop scenes (mAP, Mean IoU, Grasp Viability, and latency breakdown).
6. [**06. Viva Voce Oral Defense & Examiner Question Guide**](./docs/06_VIVA_VOCE_DEFENSE_AND_EXAMINER_QUESTIONS.md)
   - Comprehensive Q&A preparation guide with 10 detailed examiner questions and winning answers.


---

## 🌟 Core System Features

- **Decoupled Cloud-Native Perception**: Offloads heavy Vision Transformer inference (`DETR ResNet-50`, `Mask2Former Swin-T`, `Qwen-VL 30B`) to cloud microservices, enabling real-time visual servoing on standard low-power laptops.
- **Monocular 6D Spatial Pose**: Recovers metric $(X, Y, Z)$ Cartesian depth and 3D rotational pose from single 2D RGB camera feeds without hardware LiDAR or depth sensors.
- **Explainable Multi-Attribute Utility (MAUT)**: Dynamically balances 5 physical criteria (Vision Confidence, Mask IoU, Jaw Fit, Workspace Centering, Orientation) with collision avoidance barriers.
- **Interactive 3D Franka Panda Simulator**: Embedded 3D WebGL robotics manipulator with mouse orbit drag controls, live joint angle readouts ($J_1 \dots J_7$), and contact force physics ($12.5\,\text{N}$).
- **Automated Dataset Benchmark Suite**: Single-click evaluation suite computing academic metrics across 10 standardized tabletop scenes.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Python 3.10+
- Node.js 18+

### 2. Environment Setup
Configure your Hugging Face API key in `.env`:
```bash
HUGGINGFACE_API_KEY=hf_your_token_here
GEMINI_API_KEY=your_gemini_key_here
PORT=8010
```

### 3. Launching the Suite

**Terminal 1 — Backend API Gateway:**
```bash
cd backend
.\venv\Scripts\python.exe run.py
# Runs on http://127.0.0.1:8010
```

**Terminal 2 — Frontend Robotics Suite:**
```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:5173
```

---

## 🔬 Academic Citations

```bibtex
@inproceedings{carion2020end,
  title={End-to-End Object Detection with Transformers},
  author={Carion, Nicolas and Massa, Francisco and Synnaeve, Gabriel and Usunier, Nicolas and Kirillov, Alexander and Zagoruyko, Sergey},
  booktitle={ECCV},
  year={2020}
}

@inproceedings{cheng2022masked,
  title={Masked-attention Mask Transformer for Universal Image Segmentation},
  author={Cheng, Bowen and Misra, Ishan and Schwing, Alexander G and Kirillov, Alexander and Girdhar, Rohit},
  booktitle={CVPR},
  year={2022}
}

@article{morrison2018closing,
  title={Closing the Loop for Robotic Grasping: A Real-time, Generative Grasp Synthesis Approach},
  author={Morrison, Douglas and Corke, Peter and Leitner, Juxi},
  journal={Robotics: Science and Systems (RSS)},
  year={2018}
}
```
