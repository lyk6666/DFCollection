# DFCollection

**DFCollection** is a scalable system for comprehensive, fact-based exploration.
It visualizes the global distribution of facts, scales efficiently to large search spaces, and supports **hierarchical exploration** across categorical subspaces.

<img width="1276" height="684" alt="FullView" src="https://github.com/user-attachments/assets/06677671-ef07-4a3b-8998-fd9a6cde24f6" />

## Built With

- **Frontend:** JavaScript (React, D3)
- **Backend:** Python (FastAPI)


## Key Features

- **Collection View:**
  Visualizes collections through distance-based projection and encodes collection attributes for efficient overview and filtering.

- **Collection–Fact View:**
  Reveals the hierarchical structure of a selected collection and supports subspace-driven search and exploration.

- **Fact View:**
  Displays facts organized by similarity with intuitive score-density cues for pattern recognition.

- **Fact Gallery:**
  Records and organizes interesting findings to help users construct personalized data stories.


## Getting Started

Follow these steps to set up and run **DFCollection** locally.

### Backend Setup

1. **Navigate to the backend directory:**
   ```bash
   cd backend
   ```

2. **Create a virtual environment and install dependencies:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ``` 

3. **Run the backend:**
   ```bash
   python run.py 
   ```
*(See `run.py` for configuration details.)*


### Frontend Setup

1. **Navigate to the frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```

Once both backend and frontend are running, your local instance of **DFCollection** will be up and ready to explore!
