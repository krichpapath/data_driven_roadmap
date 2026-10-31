"""Unicode code-point CER for checked OCR transcriptions (no OCR/model dependency)."""
import argparse
import json
import unicodedata
from pathlib import Path


def character_error_rate(reference: str, actual: str, *, ignore_whitespace=False) -> dict:
    def normalize(text):
        text = unicodedata.normalize('NFC', text.replace('\r\n', '\n').replace('\r', '\n')).strip()
        return ''.join(text.split()) if ignore_whitespace else text
    reference, actual = normalize(reference), normalize(actual)
    if not reference:
        raise ValueError('A nonempty checked reference transcription is required.')
    previous = list(range(len(actual) + 1))
    for i, left in enumerate(reference, 1):
        current = [i]
        for j, right in enumerate(actual, 1):
            current.append(min(current[-1] + 1, previous[j] + 1, previous[j-1] + (left != right)))
        previous = current
    edits = previous[-1]
    return {'edits': edits, 'reference_characters': len(reference), 'cer': edits / len(reference)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('reference', type=Path)
    parser.add_argument('actual', type=Path)
    args = parser.parse_args()
    reference, actual = args.reference.read_text(encoding='utf-8'), args.actual.read_text(encoding='utf-8')
    print(json.dumps({'strict': character_error_rate(reference, actual),
                     'without_whitespace': character_error_rate(reference, actual, ignore_whitespace=True)}, indent=2))
