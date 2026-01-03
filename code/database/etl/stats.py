"""
Lightweight stats accumulator.
Reason: track inserts/skips across stages and provides a summary.
"""

def bump(stats: dict, key: str, inc: int = 1):
    stats[key] = stats.get(key, 0) + inc


def summarize(stats: dict) -> str:
    lines = []
    for k in sorted(stats.keys()):
        lines.append(f"{k}: {stats[k]}")
    return "\n".join(lines)

