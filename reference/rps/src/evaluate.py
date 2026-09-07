import json

import tensorflow as tf

from . import config
from .data_loader import load_datasets


def main():
    config.RESULT_DIR.mkdir(parents=True, exist_ok=True)

    _, _, test_ds = load_datasets()
    model = tf.keras.models.load_model(config.KERAS_MODEL_PATH)
    metrics = model.evaluate(test_ds, return_dict=True)

    result = {name: float(value) for name, value in metrics.items()}
    output_path = config.RESULT_DIR / "evaluation.json"
    output_path.write_text(json.dumps(result, indent=2), encoding="utf-8")

    print(result)
    print(f"saved evaluation: {output_path}")


if __name__ == "__main__":
    main()
