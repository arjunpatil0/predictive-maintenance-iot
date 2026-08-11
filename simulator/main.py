# main.py
"""
Convenience entry point – delegates to run_simulator.py
so users can start the simulator with either:
    python main.py
    python run_simulator.py
"""

from run_simulator import main
import asyncio

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Simulator stopped by user")
