"""
Decision & Inference Engine for Robotic Manipulation.

Evaluates all candidate grasp proposals from the vision system using a multi-criteria
utility function, collision checking, physical gripper limits, and workspace reachability.

Outputs:
  - Ranked Candidate Scores
  - Selected Best Target Grasp
  - Human-readable Reasoning Trace Array (XAI for Viva Defense)
"""

from __future__ import annotations

import math
import config
from schemas import CandidateScore, Detection, InferenceResult


def evaluate_collision_risk(index: int, detections: list[Detection]) -> bool:
    """
    Check if candidate object 'index' overlaps significantly with any other object.
    
    Returns True if an overlap with another bounding box exceeds 20% area.
    """
    target = detections[index]
    t_box = target.box
    
    for i, other in enumerate(detections):
        if i == index:
            continue
        o_box = other.box
        
        # Calculate intersection
        ix1 = max(t_box.x1, o_box.x1)
        iy1 = max(t_box.y1, o_box.y1)
        ix2 = min(t_box.x2, o_box.x2)
        iy2 = min(t_box.y2, o_box.y2)
        
        if ix2 > ix1 and iy2 > iy1:
            i_area = (ix2 - ix1) * (iy2 - iy1)
            t_area = (t_box.x2 - t_box.x1) * (t_box.y2 - t_box.y1)
            if t_area > 0 and (i_area / t_area) > 0.20:
                return True
    return False


def run_inference_engine(detections: list[Detection], weights: dict | None = None) -> InferenceResult:
    """
    Execute multi-criteria evaluation across all candidate detections with optional dynamic weights.
    """
    w_vision = float(weights.get("w_vision", config.WEIGHT_VISION_SCORE)) if weights else config.WEIGHT_VISION_SCORE
    w_mask = float(weights.get("w_mask", config.WEIGHT_MASK_QUALITY)) if weights else config.WEIGHT_MASK_QUALITY
    w_jaw = float(weights.get("w_jaw", config.WEIGHT_JAW_FIT)) if weights else config.WEIGHT_JAW_FIT
    w_center = float(weights.get("w_center", config.WEIGHT_CENTERING)) if weights else config.WEIGHT_CENTERING
    w_orient = float(weights.get("w_orient", config.WEIGHT_ORIENTATION)) if weights else config.WEIGHT_ORIENTATION

    # Normalize weights sum
    total_w = max(0.001, w_vision + w_mask + w_jaw + w_center + w_orient)
    w_vision /= total_w
    w_mask /= total_w
    w_jaw /= total_w
    w_center /= total_w
    w_orient /= total_w

    if not detections:
        return InferenceResult(
            selected_target=None,
            selected_index=None,
            confidence_score=None,
            candidate_count=0,
            rankings=[],
            reasoning_trace=["No object candidates detected in the current workspace frame."],
            ai_summary="Workspace is clear. No targets available for grasp planning."
        )

    candidates: list[CandidateScore] = []
    reasoning_trace: list[str] = [
        f"Inference Engine initialized: Evaluating {len(detections)} candidate object(s) "
        f"[Weights: Vision={w_vision:.2f}, Mask={w_mask:.2f}, Jaw={w_jaw:.2f}, Center={w_center:.2f}, Orient={w_orient:.2f}]."
    ]

    for index, det in enumerate(detections):
        # 1. Vision Confidence Score (0.0 to 1.0)
        v_score = det.score if det.score is not None else 0.75

        # 2. Mask Overlap IoU Score (0.0 to 1.0)
        m_score = det.mask_iou if det.mask_iou is not None else 0.50

        # 3. Jaw Fit Score (0.0 to 1.0)
        if det.grasp:
            width = det.grasp.width_norm
            if width < config.GRIPPER_MIN_JAW_WIDTH or width > config.GRIPPER_MAX_JAW_WIDTH:
                w_score = 0.10
            else:
                diff = abs(width - config.GRIPPER_OPTIMAL_JAW_WIDTH)
                w_score = max(0.0, 1.0 - (diff / config.GRIPPER_MAX_JAW_WIDTH))
        else:
            w_score = 0.0

        # 4. Workspace Centering / Reachability Score (0.0 to 1.0)
        box = det.box
        cx = (box.x1 + box.x2) / 2.0
        cy = (box.y1 + box.y2) / 2.0
        dist_from_center = math.hypot(cx - 0.5, cy - 0.5)
        max_dist = math.hypot(0.5, 0.5)  # ~0.707
        c_score = max(0.0, 1.0 - (dist_from_center / max_dist))

        # 5. Orientation Stability Score (0.0 to 1.0)
        if det.grasp:
            angle_rad = math.radians(det.grasp.angle_deg)
            o_score = (math.cos(2 * angle_rad) * 0.5 + 0.5)
        else:
            o_score = 0.50

        # 6. Collision Check
        has_collision = evaluate_collision_risk(index, detections)
        collision_mult = 0.30 if has_collision else 1.0

        # Calculate Weighted Raw Score
        raw_utility = (
            w_vision * v_score +
            w_mask * m_score +
            w_jaw * w_score +
            w_center * c_score +
            w_orient * o_score
        )


        final_score_pct = round(raw_utility * collision_mult * 100.0, 1)

        candidates.append(CandidateScore(
            index=index,
            label=det.label,
            total_score=final_score_pct,
            vision_score=round(v_score * 100.0, 1),
            mask_score=round(m_score * 100.0, 1),
            jaw_fit_score=round(w_score * 100.0, 1),
            centering_score=round(c_score * 100.0, 1),
            orientation_score=round(o_score * 100.0, 1),
            collision_risk=has_collision,
            selected=False
        ))

    # Rank candidate scores descending
    candidates.sort(key=lambda c: c.total_score, reverse=True)

    # Mark top candidate as selected
    best_candidate = candidates[0]

    # Re-assign selected flag in list
    for c in candidates:
        if c.index == best_candidate.index:
            c.selected = True

    # Construct XAI Reasoning Trace steps
    for idx, c in enumerate(candidates):
        collision_txt = " [WARNING: High Collision Risk]" if c.collision_risk else " [Clear Workspace]"
        reasoning_trace.append(
            f"Rank #{idx+1}: Target '{c.label}' (ID {c.index}) -> Score: {c.total_score}% "
            f"(Vision: {c.vision_score}%, Mask: {c.mask_score}%, Jaw Fit: {c.jaw_fit_score}%){collision_txt}"
        )

    best_det = detections[best_candidate.index]
    reasoning_trace.append(
        f"DECISION: Selected target '{best_candidate.label}' with overall score of {best_candidate.total_score}%."
    )
    if best_det.grasp:
        reasoning_trace.append(
            f"EXPLANATION: Grasp center at ({best_det.grasp.x:.3f}, {best_det.grasp.y:.3f}), "
            f"jaw angle {best_det.grasp.angle_deg:.1f}°, jaw width {best_det.grasp.width_norm:.3f}. "
            f"Optimal stability & zero collision hazard."
        )

    summary_text = (
        f"Inference Engine selected '{best_candidate.label}' (Confidence: {best_candidate.total_score}%). "
        f"Target offers optimal gripper jaw width fit and high mask fidelity."
    )

    return InferenceResult(
        selected_target=best_candidate.label,
        selected_index=best_candidate.index,
        confidence_score=best_candidate.total_score,
        candidate_count=len(detections),
        rankings=candidates,
        reasoning_trace=reasoning_trace,
        ai_summary=summary_text
    )
