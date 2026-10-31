"""Standalone plots from the recorded fine-grid measurements; no API calls."""
import json
import os
from pathlib import Path
import sys

plot_libs = Path(os.environ.get("LOCALAPPDATA", "")) / "Codex" / "model-experiment-plot-libs"
if plot_libs.exists():
    sys.path.insert(0, str(plot_libs))
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LogNorm
import numpy as np

base = Path("artifacts/nemotron-fine-experiment-2026-10-31")
summary = json.loads((base / "summary.json").read_text(encoding="utf-8"))
manifest = json.loads((base / "manifest.json").read_text(encoding="utf-8"))
modes = [m["mode"] for m in manifest["configurations"]]
temperatures = [i / 10 for i in range(11)]
cells = {r["id"]: r for r in summary["screen"]}
quality = np.full((len(modes), 11), np.nan)
latency = np.full_like(quality, np.nan)
accepted = np.full_like(quality, np.nan)
for i, mode in enumerate(modes):
    for j, temperature in enumerate(temperatures):
        row = cells.get(f"t{temperature:.1f}-{mode}")
        if row and row["n"] == 2:
            quality[i, j] = row["cleanCases"]
            accepted[i, j] = row["accepted"]
            latency[i, j] = max(0.1, row["medianServiceSeconds"])

plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 11})
fig, axes = plt.subplots(1, 2, figsize=(18, 9.7), layout="constrained")
fig.suptitle("Nemotron 3.5 Super VL — temperatures 0.0–1.0, every requested reasoning form", fontsize=18, fontweight="bold")
for ax in axes:
    ax.set_xticks(range(11), [f"{t:.1f}" for t in temperatures])
    ax.set_yticks(range(len(modes)), modes)
    ax.set_xlabel("Temperature", labelpad=12)
    ax.set_ylabel("Requested API reasoning payload", labelpad=10)
    ax.set_xticks(np.arange(-0.5, 11, 1), minor=True)
    ax.set_yticks(np.arange(-0.5, len(modes), 1), minor=True)
    ax.grid(which="minor", color="white", linewidth=1.4)
    ax.tick_params(which="minor", bottom=False, left=False)

cmap_q = plt.get_cmap("viridis").copy()
cmap_q.set_bad("#eeeeee")
image_q = axes[0].imshow(quality, vmin=0, vmax=2, cmap=cmap_q, aspect="auto")
axes[0].set_title("Screening checks passed, out of 2 cases", fontsize=14, pad=15)
cb_q = fig.colorbar(image_q, ax=axes[0], shrink=0.65, ticks=[0, 1, 2], pad=0.025)
cb_q.set_label("Cases meeting the screening checks")

cmap_t = plt.get_cmap("magma_r").copy()
cmap_t.set_bad("#eeeeee")
norm = LogNorm(vmin=1, vmax=105)
image_t = axes[1].imshow(latency, norm=norm, cmap=cmap_t, aspect="auto")
axes[1].set_title("Median model service time (seconds)", fontsize=14, pad=15)
cb_t = fig.colorbar(image_t, ax=axes[1], shrink=0.65, ticks=[1, 3, 10, 30, 80, 105], pad=0.025)
cb_t.set_ticklabels(["1", "3", "10", "30", "80", "105"])
cb_t.set_label("Seconds, logarithmic color scale")

for i in range(len(modes)):
    for j in range(11):
        if np.isnan(quality[i, j]):
            for ax in axes:
                ax.text(j, i, "pending", ha="center", va="center", color="#777777", fontsize=8)
            continue
        axes[0].text(j, i, f"{int(quality[i,j])}/2", ha="center", va="center", color="white" if quality[i,j] < 1.2 else "#121212", fontsize=10)
        axes[1].text(j, i, f"{latency[i,j]:.1f}", ha="center", va="center", color="white" if norm(latency[i,j]) > 0.5 else "#121212", fontsize=9)

fig.get_layout_engine().set(rect=(0, 0.10, 1, 0.80))
fig.text(0.5, 0.042, "Two synthetic screening actions per cell. Checks do not verify generated answer keys or establish population accuracy.\nRequested effort names are not verified native NVIDIA tiers. Service time excludes artificial pacing and real database/search overhead.", ha="center", va="center", fontsize=10, color="#444444")
fig.savefig(base / "temperature-reasoning-grid.png", dpi=180, facecolor="white")
fig.savefig(base / "temperature-reasoning-grid.svg", facecolor="white")
print(base.resolve() / "temperature-reasoning-grid.png")
