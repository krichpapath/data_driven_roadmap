# 0. Set up a brand-new computer

Start here if the machine has nothing installed yet. This page gets Python,
Git, and a code editor working. The [next page](installation.md) installs the
project itself.

If you already have Python 3.10+ and Git, skip to
[1. Install everything](installation.md).

---

## What you are installing, and why

| Software | Why you need it | Required? |
| --- | --- | --- |
| **Python 3.10+** | Runs the backend and the whole analysis pipeline | **Yes** |
| **Git** | Downloads the project and tracks your changes | **Yes** |
| **A code editor** | Reading and writing the code | Strongly recommended |
| **Node.js 18+** | *Only* runs the frontend tests | Optional |

!!! tip "You can skip Node.js"
    The application does not need it. It is only for the 50 frontend unit
    tests. Install it later if you ever need them.

You also need roughly **6 GB of free disk space**: about 2 GB for Python
packages and about 2.5 GB for the AI models the project downloads on first run.

---

## Install Python

The project is developed and tested on **Python 3.14**, and needs **3.10 or
newer**. Do not install Python 2 — it is a different, long-dead language.

=== "Windows"

    1. Go to <https://www.python.org/downloads/>
    2. Click the big **Download Python** button.
    3. Run the installer.

    !!! danger "Tick 'Add python.exe to PATH' on the first screen"
        This single checkbox is the most common setup mistake. If you miss it,
        every `python` command will fail with *"Python was not found"* and you
        will have to re-run the installer to fix it.

        The checkbox sits at the bottom of the very first installer screen,
        below the two big buttons. It is easy to miss.

    4. Click **Install Now**.
    5. If the installer offers **Disable path length limit** on the final
        screen, click it. This project has some deeply nested folders and that
        setting prevents a class of confusing errors later.

=== "macOS"

    The Python that ships with macOS is too old. Install a current one.

    Easiest route — download the installer from
    <https://www.python.org/downloads/> and run it.

    Or with [Homebrew](https://brew.sh), if you have it:

    ```bash
    brew install python
    ```

=== "Linux"

    Most distributions ship a suitable Python. Install it plus the venv module:

    ```bash
    sudo apt update && sudo apt install python3 python3-pip python3-venv
    ```

    On Fedora:

    ```bash
    sudo dnf install python3 python3-pip
    ```

### Check it worked

Open a **new** terminal (PowerShell on Windows, Terminal on macOS/Linux) and run:

```bash
python --version
```

You want to see `Python 3.10.x` or higher.

??? failure "Windows says 'Python was not found... Microsoft Store'"
    This is Windows' fake `python` shortcut, and it means the real Python is not
    on your PATH. Three things to try, in order:

    1. Use `py` instead of `python`:

        ```bash
        py --version
        ```

        If that works, use `py` everywhere this guide says `python`.

    2. Re-run the Python installer, choose **Modify**, and make sure
        **Add python.exe to PATH** is ticked.

    3. Turn off the fake shortcut: open **Settings → Apps → Advanced app
        settings → App execution aliases**, and switch off both entries named
        `python.exe` and `python3.exe`.

??? failure "'python' works but 'pip' does not"
    Run pip through Python instead — this always works:

    ```bash
    python -m pip --version
    ```

    Use `python -m pip install ...` in place of `pip install ...`.

---

## Install Git

=== "Windows"

    1. Download from <https://git-scm.com/download/win>
    2. Run the installer. **The defaults are fine** — click through them.
    3. This also installs **Git Bash**, a Unix-style terminal that is often
        easier for following tutorials than PowerShell.

=== "macOS"

    Git usually comes with the Xcode command line tools. Trigger the install:

    ```bash
    xcode-select --install
    ```

    Or via Homebrew:

    ```bash
    brew install git
    ```

=== "Linux"

    ```bash
    sudo apt install git
    ```

### Check it worked

```bash
git --version
```

### Tell Git who you are

Do this once per machine, or your commits will have no author:

```bash
git config --global user.name "Your Name"
```

```bash
git config --global user.email "your.email@example.com"
```

---

## Install a code editor

**Visual Studio Code** is free, works everywhere, and has good Python support.

1. Download from <https://code.visualstudio.com/>
2. Install and open it.
3. Install the **Python** extension: click the Extensions icon in the left bar,
    search `Python`, install the one published by Microsoft.

Any editor works. Avoid Notepad — it mangles line endings.

---

## Install Node.js (optional)

Only needed to run the frontend tests.

=== "Windows / macOS"

    Download the **LTS** version from <https://nodejs.org/>. Run the installer
    and accept the defaults.

=== "Linux"

    ```bash
    sudo apt install nodejs npm
    ```

### Check it worked

```bash
node --version
```

You want v18 or higher. The project is tested on v24.

---

## A note on terminals

Instructions in this handbook show commands like:

```bash
python --version
```

Type that into a terminal and press Enter.

| Your system | Use |
| --- | --- |
| Windows | **PowerShell** or **Git Bash** |
| macOS | **Terminal** |
| Linux | Your usual terminal |

Two things that trip people up constantly:

1. **Where you are matters.** Most commands assume you are inside the project
    folder. Use `cd` to get there first.
2. **Open a new terminal after installing something.** An already-open terminal
    will not see newly installed programs.

---

## Final check

Run all three. If each prints a version, you are ready.

```bash
python --version
```

```bash
git --version
```

```bash
python -m pip --version
```

| Command | Expected |
| --- | --- |
| `python --version` | `Python 3.10` or higher |
| `git --version` | any version |
| `python -m pip --version` | any version |

---

Now go to [1. Install everything](installation.md) to get the project itself.
