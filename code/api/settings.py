"""
API configuration constants.
"""

# Duplicate detection
OVERLAP_THRESHOLD = 0.8
DUPLICATE_MESSAGE = "These microscopy images were already ingested."

# Allowed subject prefixes for auto-assignment
ALLOWED_SUBJECT_PREFIXES = ("sub-rab", "sub-dbl")
