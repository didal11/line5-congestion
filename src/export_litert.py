import tensorflow as tf
import tensorflow_datasets as tfds

from . import config
from .data_loader import _normalize


def representative_dataset():
    raw_ds = tfds.load(
        config.DATASET_NAME,
        split="train[:10%]",
        as_supervised=True,
    )

    for image, label in raw_ds.take(100):
        image, _ = _normalize(image, label)
        yield [tf.expand_dims(image, axis=0)]


def export_float(model):
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    tflite_model = converter.convert()
    config.FLOAT_TFLITE_PATH.write_bytes(tflite_model)


def export_int8(model):
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    converter.representative_dataset = representative_dataset
    converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
    converter.inference_input_type = tf.uint8
    converter.inference_output_type = tf.uint8

    tflite_model = converter.convert()
    config.INT8_TFLITE_PATH.write_bytes(tflite_model)


def main():
    config.MODEL_DIR.mkdir(parents=True, exist_ok=True)
    model = tf.keras.models.load_model(config.KERAS_MODEL_PATH)

    export_float(model)
    export_int8(model)

    print(f"saved float LiteRT model: {config.FLOAT_TFLITE_PATH}")
    print(f"saved int8 LiteRT model:  {config.INT8_TFLITE_PATH}")


if __name__ == "__main__":
    main()
