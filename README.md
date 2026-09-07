# 5호선 열차별 혼잡도 추정

현재 프로젝트는 종로3가 → 화곡의 시간표 기반 혼잡도 추정으로 전환했습니다.
새 코드는 `subway/`, 상세 개발·평가 계획은 [PROJECT_PLAN.md](PROJECT_PLAN.md)에 있습니다.
기존 예제 전체 사본은 `reference/rps/`에 보관했습니다. 아래 내용은 기존 예제 설명입니다.

현재 프로젝트 구성·설계·상태 확인과 공식 원본 10개 수집을 완료했습니다. 분석 범위는 2024년 이후이며 혼잡도 9개 기준일과 열차 시간표 1개는 `data/raw/`에 있습니다. 출처·누락 기간·형식 차이는 [data/README.md](data/README.md)에 기록했습니다. 데이터 결합과 학습 모델은 아직 구현 전입니다.
`run.bat`을 더블클릭하거나 다음 명령을 사용합니다. 전역 Python 3.12를 사용하며 가상환경을 생성하지 않습니다.

```powershell
.\run.bat status
.\run.bat plan
.\run.bat check
```

새 실행 메뉴는 상태·계획·패키지 확인을 제공합니다. 아래의 예전 학습 메뉴 설명은 보관된 예제에 관한 설명입니다.

---

# 기존 Python / AI 교육 예제

Python으로 CNN을 직접 구성하고 학습한 뒤, 학습된 모델을 LiteRT(TFLite)로 변환하고 추론 성능을 비교하는 학습 프로젝트입니다.

첫 실습 대상은 TensorFlow Datasets의 `rock_paper_scissors`입니다. 데이터 수집 자체보다 **학습 파이프라인의 구조를 읽고 이해하는 것**에 초점을 둡니다.

## 전체 흐름

```text
데이터 로드/전처리
→ CNN 구조 생성
→ Loss / Optimizer 설정
→ Training
→ Test evaluation
→ Keras model 저장
→ LiteRT float / INT8 변환
→ 추론 benchmark
```

## 구조

```text
Python_AI/
├── src/
│   ├── config.py          # epoch, batch, learning rate 등 공통 설정
│   ├── data_loader.py     # RPS 데이터 로드/전처리/증강
│   ├── model.py           # CNN 구조와 compile 설정
│   ├── train.py           # 실제 학습
│   ├── evaluate.py        # 학습에 쓰지 않은 test 데이터 평가
│   ├── inference.py       # 이미지 1장의 실제 추론
│   ├── export_litert.py   # float / INT8 LiteRT 모델 변환
│   └── benchmark.py       # LiteRT 추론 정확도·지연시간·크기 비교
├── requirements.txt
└── README.md
```

`models/`와 `results/`는 실행할 때 자동 생성되며 Git에는 올리지 않습니다.

## 실행

Windows의 전역 Python 3.12 환경을 사용합니다. 프로젝트 폴더에서 다음 명령으로 의존성을 설치합니다.

```powershell
python -m pip install --upgrade -r requirements.txt
```

Windows에서는 `run.bat`을 더블클릭하면 환경 확인, 학습, 평가, LiteRT 변환, 벤치마크, 이미지 추론을 메뉴에서 선택할 수 있습니다.

직접 명령을 실행하려면 다음과 같이 사용합니다.

```powershell
python -m src.train
python -m src.evaluate
python -m src.export_litert
python -m src.benchmark
python -m src.inference path/to/image.jpg
```

VS Code 작업공간은 전역 인터프리터 `C:\Users\alstn\AppData\Local\Programs\Python\Python312\python.exe`를 사용하도록 설정되어 있습니다.

TFDS 데이터셋은 첫 실행 시 내려받습니다.

## 지금 공부할 때 볼 부분

Python 7장까지 학습한 상태라면 우선 다음 연결만 확인합니다.

- `config.py`: 이름 바인딩과 상수처럼 사용하는 설정값
- `model.py`: 함수 정의/호출, 객체 생성, 메서드 호출, 키워드 인자
- `train.py`: 함수를 나눠 프로그램을 구성하는 방법
- `model.fit(...)`: 우리가 학습 조건을 주고, TensorFlow/Keras가 실제 역전파와 weight 갱신을 수행하는 경계

이후 `if`, `for`, comprehension, class, module을 배우면 `data_loader.py`, `benchmark.py`까지 순서대로 읽습니다.

## 사람과 라이브러리의 역할

사람이 정하는 것:

- CNN 구조
- learning rate / epoch / batch size
- loss / optimizer
- 데이터 증강과 early stopping 같은 과적합 대응
- 어떤 기준으로 평가·벤치마크할지

TensorFlow/Keras가 수행하는 것:

- forward 계산
- loss 실제 계산
- 미분과 backpropagation
- optimizer에 따른 weight 갱신
- CPU/GPU에서의 수치 연산

## 주의

이 코드는 학습용 의사코드가 아니라 실제 실행을 목표로 작성했습니다. 다만 실행 머신의 TensorFlow 버전과 하드웨어 환경에 따라 설치·LiteRT 변환 호환성은 달라질 수 있습니다.
