# 1. Install everything

This page takes you from a machine that already has Python and Git to a working
checkout. Budget about 30 minutes, most of which is downloading.

!!! tip "Brand-new computer?"
    If Python and Git are not installed yet, do
    [0. Set up a new computer](prerequisites.md) first, then come back here.

---

## What you need first

| Software | Why | Version |
| --- | --- | --- |
| **Git** | To clone the repository | Any recent version |
| **Python** | Runs the backend and the whole pipeline | **3.14.8 on Windows x64 (verified lock)** |
| **A web browser** | To use the app | Chrome, Edge, Firefox, or Safari |
| **Node.js** | *Only* to run the frontend tests | 24 LTS (24.18.0 verified) |

!!! tip "Node.js is optional"
    You do **not** need Node to use the application. It is only for running the
    frontend test suite. Skip it if you just want the app working.

Check what you have:

```bash
git --version
python --version
```

If `python` is not found on Windows, try `py --version` instead, and use `py`
wherever this guide says `python`.

---

## Step 1 — Clone the repository

Use the development repository:

```bash
git clone https://github.com/krichpapath/data_driven_roadmap.git
```

```bash
cd data_driven_roadmap
```

!!! warning "Some folders are deliberately not in git"
    Completed university material lives under `archive/university/`.
    Previously tracked reports and the archive index remain eligible for Git;
    local drafts, third-party papers, and old snapshots stay ignored. See
    `archive/README.md` in the repository for the exact inventory. A clone
    does not include local-only archive files.

    `.env` is also excluded, by design. See Step 5.

---

## Step 2 — Create a virtual environment

A virtual environment keeps this project's packages separate from the rest of
your computer. Always work inside it.

=== "Windows PowerShell"

    ```bash
    python -m venv .venv-cpu
    ```

    ```bash
    .\.venv-cpu\Scripts\Activate.ps1
    ```

=== "macOS / Linux"

    ```bash
    python3 -m venv .venv-cpu
    ```

    ```bash
    source .venv-cpu/bin/activate
    ```

You will know it worked because your prompt now starts with `(.venv-cpu)`.

!!! warning "You must activate it in every new terminal"
    Opening a new terminal drops you out of the virtual environment. If a
    command suddenly says "module not found", this is almost always why.

---

## Step 3 — Install the Python packages

```bash
python -m pip install -r requirements.lock
```

This is the big download — roughly 2 GB, mostly PyTorch. Be patient.

!!! tip "Computer with an NVIDIA graphics card?"
    Use `.venv-gpu` instead of `.venv-cpu` in Step 2, and install the CUDA
    build of PyTorch **before** the lock file. Assessments then take under
    1 second instead of 20–30 seconds, with identical results.

    ```bash
    python -m pip install torch==2.14.1 --index-url https://download.pytorch.org/whl/cu130
    python -m pip install -r requirements.lock
    ```

The runtime lock includes pytest and the API test client. For the optional
Gradio developer UIs and documentation tools:

```bash
python -m pip install -r requirements-dev.lock
```

??? question "Why are there two requirements files?"
    `requirements.txt` is what the *application* needs. `requirements-dev.txt`
    adds testing tools (pytest), the documentation site (MkDocs), and the
    optional Gradio developer UIs. A person who only wants to run the app should
    not have to install all of that. Keeping them separate is deliberate.

---

## Step 4 — The AI models (automatic)

The project uses five pretrained models from Hugging Face. **You do not
download these manually.** The first time you run an assessment they download
themselves into a cache folder (`~/.cache/huggingface/`), about 2.5 GB total.

| Model | Job |
| --- | --- |
| `all-MiniLM-L6-v2` | Finds the most meaningful sentences |
| `deberta-v3-base-zeroshot-v2.0` | Sorts sentences into PESTLE categories |
| `sentiment-roberta-large-english` (SiEBERT) | Good/bad, general news |
| `finbert` | Good/bad, financial news |
| `distilroberta-base-climate-sentiment` | Good/bad, climate news |

!!! warning "The first assessment is slow"
    The first run can take several minutes while models download and load.
    Later latency depends on hardware and input. Check server output if a
    request fails; unit tests do not confirm that the models are available.

---

## Step 5 — Optional: the LLM API key

The app runs perfectly well **without** this. Skip it if you like.

By default, the app writes review advice from fixed rules. Hosted advice requires
a key, a server setting that permits it, and the **Use hosted AI guidance** checkbox
in the advisor's Settings. The checkbox resets off when the advisor is reopened
or its API endpoint changes.

To enable it, create a file named `.env` in the project root:

```text
OPENROUTER_API_KEY=your_key_here
DDRM_EXTERNAL_AI=on
```

!!! danger "Never commit `.env`"
    It contains a secret. The `.gitignore` already excludes it — leave that
    alone. If you ever paste a key into a file that *is* tracked by git, treat
    that key as compromised and generate a new one.

---

## Step 6 — Check it worked

```bash
pytest
```

You should see **82 passed**. This verifies the tested Python helpers; it does
not verify model downloads, model inference, or external services.

Now go to [2. Run the app](first-run.md).

---

## If something went wrong

| Symptom | Fix |
| --- | --- |
| `python: command not found` | Try `py` instead (Windows), or `python3` (macOS/Linux). |
| `pip` install fails on `lxml` | Install a C build toolchain, or use a newer Python. |
| `ModuleNotFoundError` when running | You forgot to activate the venv — see Step 2. |
| `pytest` says "no tests ran" | You are not in the project root. `cd` there first. |
| Something else | See [Troubleshooting](../guide/troubleshooting.md). |

## Phase 1 reproducibility

Use the lock files above to reproduce the validated installation. Direct
requirements files record the selected package versions; the locks also pin
transitive dependencies. Keep an existing environment intact when testing
updates: create a separate virtual environment. See the
[readiness report](../readiness/report.md) for verification and exceptions.

Hosted guidance requires both `DDRM_EXTERNAL_AI=on` and the advisor
**Use hosted AI guidance** checkbox. An API key alone does not enable it.
