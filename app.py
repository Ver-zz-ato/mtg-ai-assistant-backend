from flask import Flask, request, jsonify
import os
from dotenv import load_dotenv
from openai import OpenAI

# Load .env file
load_dotenv()

# Print debug info
print("✅ Flask app starting...")
print("✅ Using OpenAI key (last 4 chars):", os.getenv("OPENAI_API_KEY")[-4:])

# Initialize OpenAI client
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Initialize Flask
app = Flask(__name__)

# Health check route
@app.route("/test", methods=["GET"])
def test():
    return jsonify({"status": "ok", "message": "✅ Backend is running!"})

# Chat endpoint
@app.route("/api", methods=["POST"])
def generate_response():
    data = request.get_json()
    user_input = data.get("prompt", "")

    if not user_input:
        return jsonify({"error": "No prompt provided"}), 400

    try:
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are an MTG assistant."},
                {"role": "user", "content": user_input}
            ]
        )
        message = response.choices[0].message.content
        return jsonify({"response": message})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(port=5000)
