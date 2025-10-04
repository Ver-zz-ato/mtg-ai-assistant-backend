// backend/index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fetch from 'node-fetch';
import multer from 'multer';
import Tesseract from 'tesseract.js';

dotenv.config();

const app = express();
const port = 5000;

// Configure CORS for production domains
app.use(cors({
  origin: [
    'https://manatap.ai',
    'https://app.manatap.ai',
    'http://localhost:3000' // For development
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  optionsSuccessStatus: 200 // Some legacy browsers choke on 204
}));

app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🧠 In-memory game memory log
let memoryLog = [];

// 📥 Inject memory manually
app.post('/api/memory', (req, res) => {
  const { memory } = req.body;
  if (!memory) return res.status(400).json({ error: 'Memory is required.' });
  memoryLog.push(memory);
  console.log('🧠 Memory stored:', memory);
  res.json({ message: 'Memory stored successfully.' });
});

// 📤 Retrieve memory log
app.get('/api/memory', (req, res) => {
  res.json({ memoryLog });
});

// ❌ Clear memory log
app.post('/api/memory/reset', (req, res) => {
  memoryLog = [];
  console.log('🧹 Memory wiped.');
  res.json({ message: 'Memory log cleared.' });
});

// 🧠 Query zones only (zone-tracked)
app.get('/api/zones', (req, res) => {
  const zoneEntries = memoryLog.filter(entry => entry.includes('[[zone::'));
  res.json({ zoneMemory: zoneEntries });
});

// 🔍 OCR card name from uploaded image
const upload = multer({ storage: multer.memoryStorage() });

app.post('/api/ocr', upload.single('cardImage'), async (req, res) => {
  try {
    const imageBuffer = req.file.buffer;
    const result = await Tesseract.recognize(imageBuffer, 'eng');
    const text = result.data.text;
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    const possibleName = lines[0];
    console.log('🔍 OCR Extracted:', possibleName);
    res.json({ cardName: possibleName });
  } catch (error) {
    console.error('❌ OCR Error:', error);
    res.status(500).json({ error: 'Failed to process image.' });
  }
});

// 🔗 Get Scryfall card data by name
app.get('/api/scryfall/:name', async (req, res) => {
  const cardName = req.params.name;
  try {
    const response = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`);
    const data = await response.json();
    if (data.object === 'error') throw new Error(data.details);
    res.json({ card: data });
  } catch (error) {
    console.error('❌ Scryfall Error:', error);
    res.status(500).json({ error: 'Failed to fetch card from Scryfall.' });
  }
});

// 📦 Inject full decklist
app.post('/api/decklist', (req, res) => {
  const { deck } = req.body;
  if (!deck) return res.status(400).json({ error: 'Decklist is required.' });

  const lines = deck.split('\n').map(line => line.trim()).filter(Boolean);
  const parsed = lines.map(line => {
    const parts = line.match(/^(\d+)x?\s+(.+)$/);
    if (!parts) return null;
    const count = parseInt(parts[1], 10);
    const card = parts[2];
    return Array(count).fill(`[[deck::${card}]]`);
  }).flat().filter(Boolean);

  memoryLog.push(...parsed);
  console.log('🧠 Deck injected:', parsed.length, 'cards');
  res.json({ message: `${parsed.length} cards added to memory.` });
});

// 🤖 Ask GPT with injected memory
app.post('/api/ask', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt is required.' });

  // Auto-memory tag example (cast, dies, exile)
  const autoTagRules = [
    { regex: /Player \d+ casts? (.+?)\./i, zone: 'Battlefield' },
    { regex: /(.+?) dies|is destroyed/i, zone: 'Graveyard' },
    { regex: /(.+?) is exiled/i, zone: 'Exile' }
  ];

  for (const rule of autoTagRules) {
    const match = prompt.match(rule.regex);
    if (match) {
      const card = match[1].trim();
      const zoneMemory = `[[zone::Unknown Player::${rule.zone}::${card}]]`;
      memoryLog.push(zoneMemory);
      console.log('🧠 Auto-zone memory added:', zoneMemory);
    }
  }

  // Include full memory in system prompt
  const formattedMemory = memoryLog.map(m => `- ${m}`).join('\n');
  const systemPrompt = `You are MTG-GPT, a Magic: The Gathering assistant with memory.\n\nKnown game events this session:\n${formattedMemory}\n\nNow answer the player's question below.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
    });

    const reply = completion.choices[0].message.content;
    console.log('✅ GPT Response:', reply);

    if (!prompt.trim().endsWith('?')) {
      memoryLog.push(prompt);
      console.log('🧠 Memory auto-tagged from user prompt.');
    }

    res.json({ response: reply });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: 'Failed to fetch from OpenAI.' });
  }
});

app.get('/', (req, res) => {
  res.send('✅ MTG AI backend running');
});

app.listen(port, () => {
  console.log(`🚀 Server live at http://localhost:${port}`);
});