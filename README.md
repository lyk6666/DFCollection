DFCollection – Interview Branch
This branch is specifically designed for **interview demonstrations**.
It uses **pre-computed data facts** to allow participants to explore the system efficiently, saving time by avoiding on-the-fly computations.

# Backend Configuration

You can control how DFCollection handles data facts through environment variables:

## To Store Data Facts
Enable the following setting to generate and save computed data facts:
```python
STORE_INSIGHTS_TO_DISK = True
```

Then, specify the name of the precomputed facts you wish to store:
```python
PRECOMPUTED_INSIGHTS_NAME = "your_fact_name"
```

The generated facts will be saved in the folder:
```
precomputed_insights/
```

## To Load Precomputed Facts
After storing the facts, you can disable storage and load them directly to save processing time:
```python
STORE_INSIGHTS_TO_DISK = False
LOAD_INSIGHTS_FROM_DISK = True
```

With this setup, DFCollection will **bypass fact generation** and directly use the **precomputed data facts**, allowing for faster and smoother demonstrations.

## Available Precomputed Facts
Currently, there are **two precomputed data fact sets** available for interview use.
You can find them inside the `precomputed_insights` folder.

# Frontend Configuration

You can configure **ngrok** to allow participants to access the system online without requiring a local deployment.  

To do this, open the `ngrok.yml` file and fill in your **authentication tokens** and **custom domains** as needed.  
Once configured, each participant will be able to access DFCollection securely through the provided ngrok tunnel.
