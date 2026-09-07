"""Project readiness checks; no heavyweight ML imports required."""
import argparse
from importlib import metadata
import sys

from .config import ROOT, RAW_DIR, ROUTE


def status():
    print(f"5호선: {ROUTE[0]} → {ROUTE[-1]} / {len(ROUTE)}개 역")
    print("완료: 프로젝트 설정, 상태 확인, 개발·평가 설계")
    print("예정: 원본 검증·결합, 기준 추정, Keras 학습, LiteRT 변환")
    print("출력 목표: 시간표상 열차의 통계적 추정 (개별 열차 관측값 없음)")
    for label, patterns in (
        ("혼잡도", ("congestion_*.xlsx", "congestion_*.csv")),
        ("시간표", ("timetable_*.csv",)),
    ):
        files = sorted({p for pattern in patterns for p in RAW_DIR.glob(pattern) if p.is_file()})
        print(f"{label}: " + (", ".join(p.name for p in files) if files else "프로젝트 원본 미수집"))
    print("파일 발견은 내용 검증 완료를 의미하지 않습니다.")


def check():
    print(f"Python: {sys.version.split()[0]} / {sys.executable}")
    print(f"가상환경 사용: {sys.prefix != sys.base_prefix}")
    for package in ("tensorflow", "keras", "tf-keras", "tensorflow-model-optimization", "ai-edge-litert", "numpy"):
        try:
            print(f"{package}: {metadata.version(package)}")
        except metadata.PackageNotFoundError:
            print(f"{package}: 미설치")
    print("등록 버전 확인이며 학습·변환 호환성 검사는 아닙니다.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("status", "plan", "check"), nargs="?", default="status")
    args = parser.parse_args()
    if args.command == "plan":
        print((ROOT / "PROJECT_PLAN.md").read_text(encoding="utf-8"))
    elif args.command == "check":
        check()
    else:
        status()


if __name__ == "__main__":
    main()
