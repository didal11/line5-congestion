import tensorflow as tf
import tensorflow_datasets as tfds

from . import config


def _normalize(image, label):
    image = tf.image.resize(image, config.IMAGE_SIZE)
    image = tf.cast(image, tf.float32) / 255.0
    return image, label


_augmentation = tf.keras.Sequential(
    [
        tf.keras.layers.RandomFlip("horizontal"),
        tf.keras.layers.RandomRotation(0.05),
        tf.keras.layers.RandomZoom(0.08),
    ],
    name="augmentation",
)


def _augment(image, label):
    image = _augmentation(image, training=True)
    return image, label


def load_datasets():
    train_raw, val_raw, test_raw = tfds.load(
        config.DATASET_NAME,
        split=["train[:80%]", "train[80%:]", "test"],
        as_supervised=True,
    )

    train_ds = (
        train_raw
        .map(_normalize, num_parallel_calls=tf.data.AUTOTUNE)
        .shuffle(1000, seed=config.SEED)
        .batch(config.BATCH_SIZE)
        .map(_augment, num_parallel_calls=tf.data.AUTOTUNE)
        .prefetch(tf.data.AUTOTUNE)
    )

    val_ds = (
        val_raw
        .map(_normalize, num_parallel_calls=tf.data.AUTOTUNE)
        .batch(config.BATCH_SIZE)
        .prefetch(tf.data.AUTOTUNE)
    )

    test_ds = (
        test_raw
        .map(_normalize, num_parallel_calls=tf.data.AUTOTUNE)
        .batch(config.BATCH_SIZE)
        .prefetch(tf.data.AUTOTUNE)
    )

    return train_ds, val_ds, test_ds


def get_class_names():
    builder = tfds.builder(config.DATASET_NAME)
    return builder.info.features["label"].names
