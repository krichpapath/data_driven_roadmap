import pytest
from tools.ocr_metrics import character_error_rate


def test_cer_counts_insertions_deletions_and_substitutions():
    assert character_error_rate('abc', 'axc')['edits'] == 1
    assert character_error_rate('abc', 'ac')['edits'] == 1
    assert character_error_rate('abc', 'abbc')['edits'] == 1
    assert character_error_rate('日本語', '日 本 語')['edits'] == 2
    assert character_error_rate('日本語', '日 本 語', ignore_whitespace=True)['cer'] == 0
    assert character_error_rate('é', 'e\u0301')['cer'] == 0
    with pytest.raises(ValueError):
        character_error_rate('', 'anything')
