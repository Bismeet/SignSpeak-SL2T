"""SignSpeak offline data + training package.

This package is deliberately *separate* from the web application. Nothing here is
imported by the browser build; the only contract between the two is:

  1. The feature vector layout (`ss-features-v1`, 159 floats) implemented twice —
     once in `lib/vision/features.ts` and once in `signdata/features.py`. The two
     must agree exactly; `ml/scripts/build_fixtures.py` writes fixtures and
     `tests/features-parity.test.ts` asserts equality in CI (risk R14).
  2. The JSON shapes in `lib/types.ts` (`ModelCard`, `CollectedSample`).

Keeping the pipeline in Python is not a preference, it is the documented stack
(`docs/technical-architecture.md` §7): scikit-learn has no browser equivalent, and
skl2onnx gives us a model that *is* runnable in the browser.
"""

__all__ = [
    "constants",
    "dataset",
    "evaluation",
    "export",
    "features",
    "io",
    "models",
    "schema",
    "synthetic",
]
