from flask import Flask, request, jsonify
from openai import OpenAI
from dotenv import load_dotenv
import os

# Load .env variables
load_dotenv()
api_key = os.getenv("OPENAI_API_KEY")

# Initialize OpenAI client
client = OpenAI(api_key=api_key)

# Create Flask app
app = Flask(__name__)

@app.route("/test", methods=["GET"])
def test():
    return jsonify({"status": "ok", "message": "✅ Backend is running!"})

@app.route("/api", methods=["POST"])
def generate_response():
    data = request.get_json()
    user_input = data.get("prompt", "")

    if not user_input:
        return jsonify({"error": "No prompt provided"}), 400

    try:
        completion = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are an MTG assistant."},
                {"role": "user", "content": user_input}
            ]
        )
        reply = completion.choices[0].message.content
        return jsonify({"response": reply})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    print("✅ Starting local Flask server...")
    app.run(port=5000)
