import json
import random

import numpy as np
import tensorflow as tf

from . import config
from .data_loader import load_datasets
from .model import build_model


def set_seed():
    random.seed(config.SEED)
    np.random.seed(config.SEED)
    tf.random.set_seed(config.SEED)


def main():
    set_seed()
    config.MODEL_DIR.mkdir(parents=True, exist_ok=True)
    config.RESULT_DIR.mkdir(parents=True, exist_ok=True)

    train_ds, val_ds, _ = load_datasets()
    model = build_model()
    model.summary()

    callbacks = [
        tf.keras.callbacks.EarlyStopping(
            monitor="val_loss",
            patience=3,
            restore_best_weights=True,
        ),
        tf.keras.callbacks.ModelCheckpoint(
            filepath=config.KERAS_MODEL_PATH,
            monitor="val_loss",
            save_best_only=True,
        ),
    ]

    history = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=config.EPOCHS,
        callbacks=callbacks,
    )

    model.save(config.KERAS_MODEL_PATH)

    history_path = config.RESULT_DIR / "training_history.json"
    history_path.write_text(json.dumps(history.history, indent=2), encoding="utf-8")
    print(f"saved model: {config.KERAS_MODEL_PATH}")
    print(f"saved history: {history_path}")


if __name__ == "__main__":
    main()
