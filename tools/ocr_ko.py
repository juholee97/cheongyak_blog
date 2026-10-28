# 한국어 OCR: python tools/ocr_ko.py a.png b.png ... → 표준출력에 JSON { 파일: [줄, …] }  (PP-OCRv5 한국어 모델, 이미지를 2배로 키워 읽는다)
# 쓰는 곳: crawler/sh_attach.mjs (SH 공고 첨부 이미지에서 접수 일정 읽기), 숫자 대조. 환경: tools/ocr_venv (rapidocr onnxruntime pillow)
import sys, json, io
from rapidocr import RapidOCR, LangRec, OCRVersion, ModelType
from PIL import Image
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
eng = RapidOCR(params={'Rec.lang_type': LangRec.KOREAN, 'Rec.ocr_version': OCRVersion.PPOCRV5, 'Rec.model_type': ModelType.MOBILE, 'Global.log_level': 'error'})
out = {}
for f in sys.argv[1:]:
    im = Image.open(f).convert('RGB'); im = im.resize((im.width * 2, im.height * 2))
    r = eng(im)
    rows = {}
    for box, t in zip([] if r.boxes is None else r.boxes, [] if r.txts is None else r.txts):
        rows.setdefault(round(sum(p[1] for p in box) / 4 / 25), []).append((box[0][0], t))
    out[f] = [' '.join(t for _, t in sorted(rows[y])) for y in sorted(rows)]
print(json.dumps(out, ensure_ascii=False))
