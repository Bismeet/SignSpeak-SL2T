import json
from pathlib import Path
import numpy as np

samples_dir = Path("ml/data/isl-alphabet/samples")

for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
    file_path = samples_dir / f"alphabet__{letter}.json"
    if not file_path.exists():
        continue
    data = json.loads(file_path.read_text(encoding="utf-8"))
    features = np.array(data["samples"][0]["features"])
    
    left_present = features[:, 126] > 0.5
    right_present = features[:, 127] > 0.5
    
    both = np.mean(left_present & right_present) * 100
    left_only = np.mean(left_present & ~right_present) * 100
    right_only = np.mean(~left_present & right_present) * 100
    neither = np.mean(~left_present & ~right_present) * 100
    
    print(f"{letter}: Both={both:4.1f}% | LeftOnly={left_only:4.1f}% | RightOnly={right_only:4.1f}% | Neither={neither:4.1f}%")
