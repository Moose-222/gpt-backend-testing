const express = require('express');
const axios = require('axios');
require('dotenv').config();
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3002;
const cors = require('cors');
app.use(cors());


app.use(express.json());

console.log("OpenAI API Key:", process.env.OPENAI_API_KEY);  // Temporary for debugging

// Create a rate limiter for OpenAI API requests
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 requests per minute
  message: { error: 'Too many requests, please try again later.' },
});

app.use('/api/chatgpt', limiter); // Apply rate limiting to the OpenAI route

app.post('/api/chatgpt', async (req, res) => {
  console.log('Received request:', req.body);  // Log incoming request body

  const userMessage = req.body.message;
  const apiKey = process.env.OPENAI_API_KEY;

  if (!userMessage) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: userMessage }],
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const reply = response.data.choices[0].message.content;
    res.json({ reply });
  } catch (error) {
    console.error(error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Something went wrong', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

app.get('/', (req, res) => {
    res.send('Backend is running!');
});
