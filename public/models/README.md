# Model files

Model weight files are **not included in this repository** — they are proprietary IP.

## What's expected here

```
public/models/
├── plant_disease_model.onnx       (~78 MB) — main classifier
├── plant_disease_model.onnx.data  (external weights)
├── kropscan_production_model.onnx (alternative classifier, optional)
├── model_info.json                ✓ tracked (40-class label map)
├── class_indices.json             ✓ tracked
└── treatment_database.json        ✓ tracked (treatment plans)
```

## How to obtain models

**For HackDays 4.0 evaluation:** the model loads at runtime when running the dev server on the author's machine. Live demo is performed from `localhost:5173`. Judges who need to clone and run independently should contact the author.

**Contact:** dev@409.ai

## License

Model weights are proprietary. Not licensed for redistribution, derivative training, or commercial use without written permission. See [LICENSE](../../LICENSE).
