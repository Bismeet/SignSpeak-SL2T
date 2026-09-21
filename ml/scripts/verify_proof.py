import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

import numpy as np
import onnxruntime as ort

from ml.signdata.io import find_sample_files, load_samples
from ml.signdata.dataset import build_bundle
from ml.train_and_export import DEFAULT_WORDS, NEGATIVE_CLASS_GLOSS

def main():
    paths = find_sample_files(Path('ml/data/isl-subset/samples'))
    samples, _ = load_samples(paths)
    bundle = build_bundle(samples, vocabulary=(*DEFAULT_WORDS, NEGATIVE_CLASS_GLOSS))

    session = ort.InferenceSession('public/models/sign-clf-v1.onnx')
    input_name = session.get_inputs()[0].name
    card = json.loads(Path('public/models/model-card.json').read_text())
    vocab = card['vocabulary']

    # Batch run
    probs_list = []
    batch_size = 256
    for i in range(0, len(bundle.x), batch_size):
        batch = bundle.x[i:i+batch_size].astype(np.float32)
        res = session.run(None, {input_name: batch})
        p = res[1] if len(res) > 1 else res[0]
        probs_list.append(p)
    probs = np.vstack(probs_list)
    preds = np.argmax(probs, axis=1)
    y_true = bundle.y

    print("=" * 85)
    print("LIVE PROOF: DIRECT ONNX MODEL INFERENCE ON LOCAL ISL DATASET")
    print("=" * 85)
    print(f"Model File: public/models/sign-clf-v1.onnx ({Path('public/models/sign-clf-v1.onnx').stat().st_size / 1024 / 1024:.1f} MB)")
    print(f"Total Dataset Frames Tested: {len(y_true)}")
    print(f"Overall Accuracy Across All Frames: {np.mean(preds == y_true):.1%}")
    print("-" * 85)
    print(f"{'SIGN / PHRASE':<14} | {'CLIPS':<6} | {'FRAMES':<7} | {'ACCURACY':<9} | {'AVG CONF':<9} | {'TEST SAMPLE PREDICTION'}")
    print("-" * 85)

    for idx, cname in enumerate(bundle.classes):
        mask = (y_true == idx)
        if not np.any(mask):
            continue
        acc = np.mean(preds[mask] == idx)
        conf = np.mean(probs[mask, idx])
        clip_count = bundle.per_class_samples.get(cname, 0)
        
        # Pick middle frame of middle clip as representative
        ex_idx = np.where(mask)[0][len(np.where(mask)[0]) // 2]
        pred_cname = vocab[preds[ex_idx]]
        ex_prob = probs[ex_idx, preds[ex_idx]]
        
        status = "MATCH" if pred_cname.upper() == cname.upper() else "CONFUSION"
        print(f"{cname:<14} | {clip_count:<6} | {np.sum(mask):<7} | {acc:<9.1%} | {conf:<9.1%} | {pred_cname.upper()} ({ex_prob:.1%}) [{status}]")

    print("-" * 85)
    print("\nGESTURE DETECTION (RULE-BASED):")
    print("  * Wave gesture -> 'Hello!' (detected via wrist/knuckle oscillation state machine)")
    print("=" * 85)

if __name__ == '__main__':
    main()
