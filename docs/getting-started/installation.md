# 1. Install everything

This page takes you from a clean machine to a working checkout. Budget about
30 minutes, most of which is downloading.

---

## What you need first

| Software | Why | Version |
| --- | --- | --- |
| **Git** | To clone the repository | Any recent version |
| **Python** | Runs the backend and the whole pipeline | **3.10 or newer** |
| **A web browser** | To use the app | Chrome, Edge, Firefox, or Safari |
| **Node.js** | *Only* to run the frontend tests | 18 or newer |

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

```bash
git clone https://github.com/ComSciThammasatU/2568-2-cs403-final-submission-68-1_22_nrc-r1.git
```

```bash
cd 2568-2-cs403-final-submission-68-1_22_nrc-r1
```

---

## Step 2 — Create a virtual environment

A virtual environment keeps this project's packages separate from the rest of
your computer. Always work inside it.

=== "Windows"

    ```bash
    python -m venv venv
    ```

    ```bash
    venv\Scripts\activate
    ```

=== "macOS / Linux"

    ```bash
    python3 -m venv venv
    ```

    ```bash
    source venv/bin/activate
    ```

You will know it worked because your prompt now starts with `(venv)`.

!!! warning "You must activate it in every new terminal"
    Opening a new terminal drops you out of the virtual environment. If a
    command suddenly says "module not found", this is almost always why.

---

## Step 3 — Install the Python packages

```bash
pip install -r requirements.txt
```

This is the big download — roughly 2 GB, mostly PyTorch. Be patient.

If you also want to run the tests or the optional Gradio developer UI:

```bash
pip install -r requirements-dev.txt
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
    Expect several minutes on the very first run while models download. Every
    run after that is roughly 45–60 seconds. Nothing is broken; it is
    downloading.

---

## Step 5 — Optional: the LLM API key

The app runs perfectly well **without** this. Skip it if you like.

Without a key, the app writes review advice from a fixed set of rules. With a
key, it asks a language model to write tailored advice per PESTLE role.

To enable it, create a file named `.env` in the project root:

```text
OPENROUTER_API_KEY=your_key_here
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

You should see **54 passed**. If you do, your Python environment is correct.

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
