import { BookOpen, ExternalLink, FileText, Sparkles } from 'lucide-react'

export function ResearchDocs({ isOpen, onClose }) {
  if (!isOpen) return null

  const PUBLICATIONS = [
    {
      title: 'End-to-End Object Detection with Transformers (DETR)',
      authors: 'Nicolas Carion, Francisco Massa, Gabriel Synnaeve, Nicolas Usunier, Alexander Kirillov, Sergey Zagoruyko',
      conference: 'European Conference on Computer Vision (ECCV 2020)',
      doi: '10.1007/978-3-030-58452-8_13',
      role: 'Stage 2: End-to-end bipartite matching object localization and bounding box regression.',
    },
    {
      title: 'Masked-attention Mask Transformer for Universal Image Segmentation (Mask2Former)',
      authors: 'Bowen Cheng, Ishan Misra, Alexander G. Schwing, Alexander Kirillov, Rohit Girdhar',
      conference: 'IEEE/CVF Conference on Computer Vision and Pattern Recognition (CVPR 2022)',
      doi: '10.1109/CVPR52688.2022.00135',
      role: 'Stage 3: Panoptic pixel-level mask extraction and object silhouette isolation.',
    },
    {
      title: 'Closing the Loop for Robotic Grasping: A Real-time, Generative Grasp Synthesis Approach',
      authors: 'Douglas Morrison, Peter Corke, Juxi Leitner',
      conference: 'Robotics: Science and Systems (RSS 2018) / IJRR 2020',
      doi: '10.1177/0278364920908277',
      role: 'Stage 4: 2D antipodal parallel-jaw grasp synthesis and orientation moment analysis.',
    },
    {
      title: 'PyBullet, a Python module for physics simulation for games, robotics and machine learning',
      authors: 'Erwin Coumans, Yunfei Bai',
      conference: 'GitHub & PyBullet Research (2016-2021)',
      doi: 'http://pybullet.org',
      role: 'Stage 5: 3D rigid-body contact dynamics, joint motor velocity control, and numerical IK.',
    },
    {
      title: 'Multiple View Geometry in Computer Vision (2nd Edition)',
      authors: 'Richard Hartley, Andrew Zisserman',
      conference: 'Cambridge University Press (2004)',
      doi: '10.1017/CBO9780511811685',
      role: 'Pinhole Camera Intrinsic Matrix K & Perspective-n-Point (PnP) 6D Pose Mapping.',
    },
    {
      title: 'Decisions with Multiple Objectives: Preferences and Value Trade-Offs',
      authors: 'Ralph L. Keeney, Howard Raiffa',
      conference: 'Cambridge University Press (1993)',
      doi: '10.1017/CBO9780511983832',
      role: 'Multi-Attribute Utility Theory (MAUT) for real-time grasp candidate ranking.',
    },
  ]

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content research-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <BookOpen size={20} className="text-accent" />
            <div>
              <h3>Theoretical Foundations & Research Bibliography</h3>
              <p className="modal-sub">
                Peer-reviewed literature, formal mathematical derivations, and algorithm citations.
              </p>
            </div>
          </div>
          <button type="button" className="btn-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          {/* Mathematical Formulations Section */}
          <div className="research-section">
            <h4>📐 Mathematical Formulations & Pipeline Proofs</h4>
            <div className="math-grid">
              <div className="math-card">
                <span className="math-title">1. Multi-Criteria Grasp Quality Index (MAUT Formulation)</span>
                <div className="math-formula mono">
                  Q(g_i) = γ_coll · Σ (w_k · S_k(g_i)),  where Σ w_k = 1.0
                </div>
                <p className="math-desc">
                  Multi-Attribute Utility function combining Vision Confidence (S1), Mask IoU (S2), Gripper Jaw Fit (S3), Workspace Centering (S4), and Orientation Stability (S5), penalized by binary collision factor γ_coll in {0.3, 1.0}.
                </p>
              </div>

              <div className="math-card">
                <span className="math-title">2. Pinhole Projection & Depth Reconstruction</span>
                <div className="math-formula mono">
                  Z = (f · H_nominal) / h_bbox,   X = ((c_x - 0.5) · Z) / f,   p_cam = K^(-1) · p_img
                </div>
                <p className="math-desc">
                  Pinhole projective camera geometry mapping 2D normalized image space to 3D Cartesian workspace coordinates in meters.
                </p>
              </div>

              <div className="math-card">
                <span className="math-title">3. Damped Least Squares Numerical IK (DLS)</span>
                <div className="math-formula mono">
                  Δθ = J^T · (J · J^T + λ^2 · I)^(-1) · e_cartesian
                </div>
                <p className="math-desc">
                  Solves Franka Emika Panda 7-DOF joint angle velocities avoiding kinematic singularities near physical workspace boundaries.
                </p>
              </div>
            </div>

          </div>

          {/* Bibliography List */}
          <div className="research-section">
            <h4>📚 Literature Citations & Academic References</h4>
            <div className="pub-list">
              {PUBLICATIONS.map((pub, idx) => (
                <div key={`pub-${idx}`} className="pub-item">
                  <div className="pub-header">
                    <span className="pub-badge">[{idx + 1}]</span>
                    <span className="pub-title">{pub.title}</span>
                  </div>
                  <div className="pub-authors">{pub.authors}</div>
                  <div className="pub-venue">
                    <em>{pub.conference}</em> &bull; <span className="mono">DOI: {pub.doi}</span>
                  </div>
                  <div className="pub-role">
                    <strong>Implementation Pipeline Role:</strong> {pub.role}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close Research Reference
          </button>
        </div>
      </div>
    </div>
  )
}
