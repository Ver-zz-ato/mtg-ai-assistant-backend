from flask import Flask, request, jsonify
import openai
import os
from dotenv import load_dotenv

# Load API key from .env
load_dotenv()
openai.api_key = os.getenv("OPENAI_API_KEY")

# Initialize Flask
app = Flask(__name__)

@app.route("/api", methods=["POST"])
def generate_response():
    data = request.get_json()
    user_input = data.get("prompt", "")

    if not user_input:
        return jsonify({"error": "No prompt provided"}), 400

    try:
        response = openai.ChatCompletion.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are an MTG assistant."},
                {"role": "user", "content": user_input}
            ]
        )
        message = response["choices"][0]["message"]["content"]
        return jsonify({"response": message})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
