"""Make ``app`` importable when running pytest from the backend directory."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
