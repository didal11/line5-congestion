import argparse

import tensorflow as tf

from . import config
from .data_loader import get_class_names


def load_image(path):
    image_bytes = tf.io.read_file(path)
    image = tf.image.decode_image(image_bytes, channels=3, expand_animations=False)
    image = tf.image.resize(image, config.IMAGE_SIZE)
    image = tf.cast(image, tf.float32) / 255.0
    return tf.expand_dims(image, axis=0)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("image", help="path to a rock/paper/scissors image")
    args = parser.parse_args()

    model = tf.keras.models.load_model(config.KERAS_MODEL_PATH)
    image = load_image(args.image)
    probabilities = model.predict(image, verbose=0)[0]

    class_names = get_class_names()
    best_index = int(tf.argmax(probabilities).numpy())

    for name, probability in zip(class_names, probabilities):
        print(f"{name:>8}: {float(probability):.4f}")
    print(f"prediction: {class_names[best_index]}")


if __name__ == "__main__":
    main()
