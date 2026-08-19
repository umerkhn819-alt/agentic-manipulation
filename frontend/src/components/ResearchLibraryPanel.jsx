import { useState } from 'react'
import { BookOpen, Copy, Check, FileText, ExternalLink } from 'lucide-react'

export function ResearchLibraryPanel() {
  const [copiedId, setCopiedId] = useState(null)

  const papers = [
    {
      id: 'foundationpose',
      title: 'FoundationPose: Unified 6D Pose Estimation and Tracking of Novel Objects',
      authors: 'Bowen Wen, Wei Yang, Jan Kautz, Stan Birchfield',
      venue: 'IEEE / CVPR 2024',
      doi: 'arXiv:2312.08344',
      bibtex: `@inproceedings{wen2024foundationpose,
  title={FoundationPose: Unified 6D Pose Estimation and Tracking of Novel Objects},
  author={Wen, Bowen and Yang, Wei and Kautz, Jan and Birchfield, Stan},
  booktitle={Proceedings of the IEEE/CVF Conference on Computer Vision and Pattern Recognition (CVPR)},
  year={2024}
}`,
      desc: 'FoundationPose establishes a unified transformer-based neural architecture for zero-shot 6D object pose estimation and 3D frame-to-frame video tracking without CAD models.',
    },
    {
      id: 'detr',
      title: 'End-to-End Object Detection with Transformers',
      authors: 'Nicolas Carion, Francisco Massa, Gabriel Synnaeve, Nicolas Usunier, Alexander Kirillov, Sergey Zagoruyko',
      venue: 'ECCV 2020',
      doi: 'arXiv:2005.12872',
      bibtex: `@inproceedings{carion2020end,
  title={End-to-End Object Detection with Transformers},
  author={Carion, Nicolas and Massa, Francisco and Synnaeve, Gabriel and Usunier, Nicolas and Kirillov, Alexander and Zagoruyko, Sergey},
  booktitle={European Conference on Computer Vision (ECCV)},
  year={2020}
}`,
      desc: 'Replaces handcrafted anchor generation with bipartite matching loss and transformer encoder-decoder attention for direct set prediction.',
    },
    {
      id: 'mask2former',
      title: 'Masked-attention Mask Transformer for Universal Image Segmentation',
      authors: 'Bowen Cheng, Ishan Misra, Alexander G. Schwing, Alexander Kirillov, Rohit Girdhar',
      venue: 'IEEE / CVPR 2022',
      doi: 'arXiv:2112.01527',
      bibtex: `@inproceedings{cheng2022masked,
  title={Masked-attention Mask Transformer for Universal Image Segmentation},
  author={Cheng, Bowen and Misra, Ishan and Schwing, Alexander G and Kirillov, Alexander and Girdhar, Rohit},
  booktitle={Proceedings of the IEEE/CVF Conference on Computer Vision and Pattern Recognition (CVPR)},
  year={2022}
}`,
      desc: 'Unified architecture for panoptic and instance segmentation constraining cross-attention to localized foreground query mask regions.',
    },
    {
      id: 'ggcnn',
      title: 'Closing the Loop for Robotic Grasping: A Real-time, Generative Grasp Synthesis Approach',
      authors: 'Douglas Morrison, Peter Corke, Jürgen Leitner',
      venue: 'Robotics: Science and Systems (RSS) 2018',
      doi: 'arXiv:1804.05172',
      bibtex: `@inproceedings{morrison2018closing,
  title={Closing the Loop for Robotic Grasping: A Real-time, Generative Grasp Synthesis Approach},
  author={Morrison, Douglas and Corke, Peter and Leitner, Juergen},
  booktitle={Robotics: Science and Systems (RSS)},
  year={2018}
}`,
      desc: 'Generative Grasping Convolutional Neural Network (GG-CNN) predicting antipodal grasp poses, jaw opening widths, and contact friction angles in real time.',
    },
  ]

  const handleCopy = (id, bibtex) => {
    navigator.clipboard.writeText(bibtex)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="studio-panel-view">
      <div className="panel-top-header">
        <div className="title-block">
          <h2>📚 Academic Literature & Research Bibliography</h2>
          <p className="subtitle">
            Peer-reviewed research foundations underpinning our 6D pose estimation, panoptic segmentation, and autonomous robotic manipulation framework.
          </p>
        </div>
      </div>

      <div className="papers-grid">
        {papers.map((p) => (
          <div key={`paper-${p.id}`} className="card paper-card">
            <div className="paper-header">
              <span className="venue-tag">{p.venue}</span>
              <span className="doi-tag mono">{p.doi}</span>
            </div>

            <h3 className="paper-title">{p.title}</h3>
            <p className="paper-authors">{p.authors}</p>
            <p className="paper-desc">{p.desc}</p>

            <div className="bibtex-block">
              <div className="bibtex-head">
                <span>BibTeX Citation</span>
                <button
                  type="button"
                  className="btn btn-copy-bib"
                  onClick={() => handleCopy(p.id, p.bibtex)}
                >
                  {copiedId === p.id ? (
                    <>
                      <Check size={12} className="text-green" /> <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={12} /> <span>Copy BibTeX</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="bibtex-code mono">{p.bibtex}</pre>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
