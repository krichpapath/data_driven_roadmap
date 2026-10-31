# Troubleshooting

Real problems that have actually happened on this project, with the real causes.

---

## Installation and environment

### `ModuleNotFoundError` for something in requirements.txt

You are not in the virtual environment. Your prompt should start with `(.venv-cpu)` or `(.venv-gpu)`.

=== "Windows"

    ```bash
    .\.venv-cpu\Scripts\Activate.ps1
    ```

=== "macOS / Linux"

    ```bash
    source .venv-cpu/bin/activate
    ```

This catches everyone. Every new terminal needs it again.

---

### The venv exists but every command fails

If you copied the project folder from another computer — or another user
account — the virtual environment is broken. A venv hardcodes the absolute path
of the Python that made it.

Check the paths inside:

```bash
cat .venv-cpu/pyvenv.cfg
```

If `home =` points somewhere that does not exist on your machine, you have two
options:

**Option A — rebuild it** (safe, slow, ~2 GB download):

```bash
python -m venv .venv-cpu --clear
```

```bash
..venv-cpuScriptspython.exe -m pip install -r requirements.lock
```

**Option B — repoint it** (fast, only if the Python version matches). Edit
`.venv-cpu/pyvenv.cfg` (or `.venv-gpu/pyvenv.cfg`) and replace `home` and `executable` with the path to your own
Python. This only works if the major.minor version is the same, because the
installed packages are compiled for a specific Python ABI.

Find your Python with:

```bash
where python
```

---

### `pytest` or `npm test` fails with `EPERM` or "Access is denied"

There is a leftover cache folder owned by a different Windows account —
typically `.pytest_cache`. Windows will not let you read or delete it.

The frontend test command is already scoped to dodge this:

```json
"test": "vitest run --dir __tests__"
```

If it still bites, delete the offending folder from an **Administrator**
terminal, or just ignore it — these folders are caches and are excluded from
git.

---

## Running the app

### `{"status":"ok"}` works but the web page shows nothing

Check the browser's developer console (++f12++). Almost always one of:

- **A `.jsx` file failed to load.** Check the Network tab for a 404. You
  probably added a file without adding its `<script>` tag to `index.html`.
- **Scripts loaded in the wrong order.** There are no imports; files must load
  in dependency order.
- **A syntax error in your JSX.** Babel compiles in the browser, so syntax
  errors appear at runtime, not build time.

---

### My frontend change does not show up

The `?v=` cache-buster. Script tags look like:

```html
<script type="text/babel" src="impact-advisor.jsx?v=10"></script>
```

The browser caches by full URL including the query. **Bump that number** when
you edit the file. A hard refresh (++ctrl+shift+r++) works for testing, but bump
the number before committing or every existing user keeps the stale copy.

---

### "Cannot reach the analysis service at 127.0.0.1:7875"

The frontend cannot reach the backend. (Older builds showed "Failed to fetch".)
Your last successful assessment stays on screen; click **Retry** once the
service is back.

1. Is the backend running? Check <http://127.0.0.1:7875/api/health>.
2. Is it on a different port? The frontend stores an override in
   `localStorage` under `ddrm_advisor_api_url`. Clear it, or set it correctly
   in the API endpoint field.

---

### A Python change has no effect

The analysis service loads `src/` once at start-up. Close the
**Start Data Driven Roadmap** window and start it again. Front-end files only need a
page reload.

---

### A web address will not import

The message names the cause:

| Message | Meaning / what to do |
|---------|----------------------|
| *Enter a full web address starting with http:// or https://* | Not a URL, another scheme (`file:`), or it contains a user name/password |
| *Article URLs must use port 80 or 443* / *private and local networks are blocked* | Blocked on purpose (protects your machine and network) |
| *The site's security certificate could not be verified* | Python on this machine does not trust the site's certificate (seen with example.com). Paste the text instead, or check antivirus HTTPS scanning / Windows root certificates |
| *The site sent br-compressed content* | Only gzip and deflate are supported. Paste the text instead |
| *The site took too long to answer* / *Could not connect* | Network problem or the site blocks automated readers |
| *No readable article text was found* | The page needs JavaScript or a login. Paste the text |

Pages over 2 MB (after decompression) are refused.

---

### The first assessment takes forever

Expected. It is downloading roughly 2.5 GB of models into
`~/.cache/huggingface/`. Subsequent runs take 45–60 seconds.

If it seems stuck, watch the cache folder grow:

```bash
du -sh ~/.cache/huggingface/hub
```

---

### The web page needs an internet connection

`roadmap_builder/index.html` loads React, ReactDOM and Babel from the
**unpkg.com CDN**. With no internet, the page loads but stays blank.

This is a known limitation. To fix it properly, download those three files into
the project and point the script tags at local copies. Note the page also uses
the React *development* build and compiles JSX in the browser — fine for a
prototype, not what you would ship to production.

---

## Wrong results

### The verdicts are wrong

**Check the evidence-points setting first.** This is the single most common
cause of unexpected verdicts, and it is subtle.

The scoring thresholds were calibrated at **7** extracted sentences
(`KEYPOINTS_MAX` in `src/config.py`). Running with fewer changes the answers on
borderline articles:

| Scenario | At 5 points | At 7 points |
| --- | --- | --- |
| `maintain_02_thai_genai_pilot` | 0.3519 → **Adjust** ✗ | 0.2947 → Maintain ✓ |
| `revise_02_sweeping_digital_mandate` | 0.5000 → **Adjust** ✗ | 0.7143 → Revise ✓ |

Both are wrong at 5 and correct at 7. Nothing is broken — the extraction count
is simply part of the calibration.

So: leave **Evidence points** at its default. If you must change it, re-run
`python tools/e2e_check.py` and expect to re-tune the thresholds.

---

### Severity is always 0.00

Every sentence is being discarded as `Unclassified`. The PESTLE classifier gate
(`PESTLE_MIN_CONFIDENCE`, default 0.65) is rejecting everything.

Usually this means the article genuinely is not about PESTLE topics — which is
correct behaviour. Confirm with:

```bash
python tools/diagnose_impact.py yourfile.txt
```

Look at the `pestle` column. If everything says `Unclassified`, the gate is
doing its job.

---

### Everything comes back Maintain

Run the diagnostic and read the **leak audit** at the bottom:

```text
neutral_sentiment       1/7
sub_tolerance_low       4/7
low_relevance_<0.5      5/7
```

That tells you exactly where signal vanished:

| Line | Meaning |
| --- | --- |
| `neutral_sentiment` | Sentences judged neutral contribute zero |
| `sub_tolerance_low` | Magnitude fell below the lower band |
| `low_relevance_<0.5` | Sentences did not match their category strongly |

---

### I get zero matched roadmap items

Matching is **PESTLE tag overlap only**. If the news is Legal and Environmental
but your roadmap items are all tagged Technological, nothing matches — by
design.

Open an item and check its PESTLE tags.

---

### The LLM advice is missing

Falls back to the fixed rule table when any of these is true:

- **Use hosted AI guidance** is unchecked or `DDRM_EXTERNAL_AI=off`
- No `OPENROUTER_API_KEY` in `.env`
- The verdict is `Maintain` (expert mode only runs for Adjust and Revise)
- There are no matched roadmap items
- Every LLM call failed or timed out

Check the guidance warning in the interface and the backend logs. A failed
guidance request falls back to deterministic advice; a failed assessment returns
an error and does not display the previous result as a successful new analysis.

---

## Errors from the API

| Status | Message | Cause |
| --- | --- | --- |
| **400** | No usable sentences found | All sentences too short or too long |
| **503** | Semantic keypoint model is unavailable | `sentence-transformers` not installed or not cached |
| **500** | Advisor failed unexpectedly | Check the backend terminal for the traceback |

---

## Tools misbehaving

### `diagnose_impact.py` crashes with `UnicodeEncodeError`

Already fixed — the tool now forces UTF-8 output. If you see this in another
script you write, the cause is that Windows terminals default to cp1252 and
cannot print characters like `≥` or `─`. Add this near the top:

```python
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
```

---

## Still stuck?

1. Read the backend terminal — the traceback is usually there.
2. Read the browser console (++f12++) for frontend issues.
3. Run `python tools/diagnose_impact.py <file>` for anything scoring-related.
4. Check [Pipeline](../PIPELINE.md) — it has a table mapping symptoms to the
   exact file and line where that failure originates.
