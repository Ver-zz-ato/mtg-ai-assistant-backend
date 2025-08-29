import requests

url = "http://localhost:5000/api"
data = {
    "prompt": "What's the best Commander for a graveyard recursion deck?"
}

response = requests.post(url, json=data)
print(response.status_code)
print(response.json())
