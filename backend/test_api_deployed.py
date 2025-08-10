import requests

url = "https://mtg-ai-assistant-backend.onrender.com/api"
data = {
    "prompt": "Suggest a budget black Commander deck with zombies"
}

response = requests.post(url, json=data)
print(response.status_code)
print(response.json())
