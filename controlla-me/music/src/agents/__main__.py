"""Allow running stem_separator as: python -m src.agents.stem_separator"""

import asyncio
from .stem_separator import _cli_main

asyncio.run(_cli_main())
