import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
import numpy as np

def main():
    app = create_app()
    app.testing = True
    client = app.test_client()

    print("Valid matrix:")
    matrix = np.random.rand(13, 9).tolist()
    response = client.post("/stats", json={"matrix": matrix})
    print(response.status_code, response.get_json())


if __name__ == "__main__":
    main()

