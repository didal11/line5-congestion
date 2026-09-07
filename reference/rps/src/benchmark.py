import json
import time

import numpy as np
import tensorflow as tf

from . import config
from .data_loader import load_datasets


def _quantize_input(sample, detail):
    dtype = detail["dtype"]
    if dtype == np.float32:
        return sample.astype(np.float32)

    scale, zero_point = detail["quantization"]
    if scale == 0:
        raise ValueError("invalid quantization scale")

    quantized = np.round(sample / scale + zero_point)
    limits = np.iinfo(dtype)
    return np.clip(quantized, limits.min, limits.max).astype(dtype)


def benchmark_tflite(model_path, test_ds, sample_limit):
    interpreter = tf.lite.Interpreter(model_path=str(model_path))
    interpreter.allocate_tensors()

    input_detail = interpreter.get_input_details()[0]
    output_detail = interpreter.get_output_details()[0]

    correct = 0
    count = 0
    latencies_ms = []

    for image, label in test_ds.unbatch().take(sample_limit):
        sample = np.expand_dims(image.numpy(), axis=0)
        sample = _quantize_input(sample, input_detail)

        interpreter.set_tensor(input_detail["index"], sample)

        start = time.perf_counter()
        interpreter.invoke()
        latencies_ms.append((time.perf_counter() - start) * 1000.0)

        output = interpreter.get_tensor(output_detail["index"])[0]
        prediction = int(np.argmax(output))

        correct += int(prediction == int(label.numpy()))
        count += 1

    return {
        "samples": count,
        "accuracy": correct / count if count else 0.0,
        "mean_latency_ms": float(np.mean(latencies_ms)) if latencies_ms else 0.0,
        "p95_latency_ms": float(np.percentile(latencies_ms, 95)) if latencies_ms else 0.0,
        "model_size_bytes": model_path.stat().st_size,
    }


def main():
    config.RESULT_DIR.mkdir(parents=True, exist_ok=True)
    _, _, test_ds = load_datasets()

    results = {}
    for name, path in {
        "float_tflite": config.FLOAT_TFLITE_PATH,
        "int8_tflite": config.INT8_TFLITE_PATH,
    }.items():
        if not path.exists():
            raise FileNotFoundError(f"missing model: {path}. Run export_litert first.")
        results[name] = benchmark_tflite(path, test_ds, config.BENCHMARK_SAMPLES)

    output_path = config.RESULT_DIR / "benchmark.json"
    output_path.write_text(json.dumps(results, indent=2), encoding="utf-8")

    print(json.dumps(results, indent=2))
    print(f"saved benchmark: {output_path}")


if __name__ == "__main__":
    main()
