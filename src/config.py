from pathlib import Path

DATASET_NAME = "rock_paper_scissors"
IMAGE_SIZE = (96, 96)
NUM_CLASSES = 3

BATCH_SIZE = 64
EPOCHS = 15
LEARNING_RATE = 1e-3
SEED = 42

BASE_DIR = Path(__file__).resolve().parents[1]
MODEL_DIR = BASE_DIR / "models"
RESULT_DIR = BASE_DIR / "results"
KERAS_MODEL_PATH = MODEL_DIR / "rps_cnn.keras"
FLOAT_TFLITE_PATH = MODEL_DIR / "rps_cnn_float.tflite"
INT8_TFLITE_PATH = MODEL_DIR / "rps_cnn_int8.tflite"

BENCHMARK_SAMPLES = 200
